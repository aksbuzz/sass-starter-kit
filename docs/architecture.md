# Architecture

This document explains how the main parts of the backend work together.

## Request lifecycle

```
Client
  │
  ▼
Fastify (rate limit → helmet/CORS headers)
  │
  ▼
authenticate hook  ──→  validates JWT + checks session in DB
  │                     populates request.ctx:
  │                       userId, tenantId, role, planId
  │                       impersonatorId  (set only during impersonation)
  ▼
requireRole hook          ──→  checks ctx.role against minimum required role
requirePlatformAdmin hook ──→  checks users.is_platform_admin (impersonate route only)
  │
  ▼
Route handler
  │
  ├── withTenant({ tenantId, userId }, async ({ repos }) => { ... })
  │     opens a transaction, sets RLS vars, builds repository instances
  │
  └── withAdmin(async ({ repos }) => { ... })
        uses admin connection (BYPASSRLS), for cross-tenant operations
```

## Database connection model

We use two PostgreSQL roles:

| Role | Used for | RLS |
|------|----------|-----|
| `app_user` | all regular API queries | active |
| `saas_admin` | migrations, cross-tenant ops, background jobs | bypassed |

The `app_user` connection pool is at `sql`. The admin pool is at `adminSql`.

Both are created once per process and shared. The context helpers (`withTenant`, `withAdmin`) open transactions on these pools, not new connections.

## Row Level Security

Every table that contains tenant data has an RLS policy like:

```sql
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Before any query inside `withTenant`, we call:

```sql
SELECT set_config('app.current_tenant_id', $tenantId, true);
SELECT set_config('app.current_user_id',   $userId,   true);
```

The `true` parameter makes these settings transaction-local — they reset automatically when the transaction ends. This prevents data leaking across requests in the same connection pool.

## Authentication and sessions

```
POST /auth/callback (OAuth)
  ├── upsert user
  ├── create session row in DB
  └── issue:
        access token  (15m, contains userId + sessionId, no tenantId yet)
        refresh token (7d, httpOnly cookie, bound to sessionId)

POST /auth/workspace
  ├── validate membership
  ├── UPDATE session SET tenant_id = ?, data = { role, planId, ... }
  └── issue new access token (contains userId + sessionId + tenantId + role)

POST /auth/refresh
  ├── verify refresh token
  ├── check session exists in DB (prevents use after logout)
  ├── rotate refresh token (delete old, create new session row)
  │     — preserves impersonation fields if present; caps TTL to 2h for impersonation sessions
  └── issue new access token

POST /auth/impersonate  (platform admin only)
  ├── verify caller is platform admin (users.is_platform_admin)
  ├── reject if target is also a platform admin
  ├── verify target has active membership in requested workspace
  ├── create new session (userId = target, data includes impersonatorId + impersonatorSessionId)
  ├── write auth.impersonate_start audit log
  └── issue tokens (access + refresh) for impersonation session (2h TTL)

POST /auth/stop-impersonation
  ├── read impersonatorSessionId from current impersonation session
  ├── delete impersonation session
  ├── verify admin's original session still valid
  ├── write auth.impersonate_stop audit log
  └── issue fresh tokens for admin's original session
```

The `authenticate` hook reads `role` from `session.data` (the database record), not from the JWT claim. This means if someone's role changes, their next request will see the new role immediately after token refresh. It also reads `impersonatorId` from `session.data` and exposes it on `ctx.impersonatorId` — services use this to tag audit log entries with `impersonatedBy`.

## Platform admin impersonation

Platform admins are identified by `users.is_platform_admin = TRUE`. This flag has no API surface — it can only be set with a direct database write. This prevents privilege escalation through any API vulnerability.

Impersonation security invariants:

- A platform admin cannot impersonate another platform admin
- Impersonation sessions expire after 2 hours regardless of activity
- The admin's original session is never modified during impersonation
- `POST /auth/workspace` is blocked while impersonating (must stop first)
- Every start/stop is audit-logged with `userId = impersonator` (not the target user)
- Every write action during impersonation carries `metadata.impersonatedBy` in the audit log
- The JWT carries an `imp` claim (impersonator user ID) so the frontend can show the banner without an extra API call

## Dependency injection

We use Inversify with constructor injection. Services are bound in `container/index.ts` as singletons. Tokens are defined in `container/tokens.ts`.

```typescript
// Defining a service
@injectable()
export class ApiKeyService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}
}

// Binding it
container.bind<ApiKeyService>(TOKENS.ApiKeyService).to(ApiKeyService).inSingletonScope()

// Using it in a route
const apiKeySvc = container.get<ApiKeyService>(TOKENS.ApiKeyService)
```

Services do not receive repositories through DI. Instead, they call `withTenant` or `withAdmin` which builds fresh repository instances inside the transaction. This ensures repositories always operate on the correct connection and with the correct tenant context.

## Background job queue

The job queue is a table in PostgreSQL. No Redis or external broker needed.

```
Enqueue:   INSERT INTO jobs (type, payload, queue, ...)
Claim:     SELECT ... FOR UPDATE SKIP LOCKED  →  UPDATE status = 'processing'
Complete:  UPDATE status = 'completed'
Fail:      UPDATE status = 'failed', error = { message, stack, attempt }
Retry:     pg_cron resets failed jobs (attempts < max_attempts) after delay
```

The poll delay uses exponential backoff so a failing job does not hammer the system.

One `JobWorker` instance per queue. The webhook worker runs at higher concurrency (10) because delivery is I/O-bound.

## Plan limits

Plan limits are enforced in the service layer, not at the database level. Before a create operation, we:

1. Load the tenant's current subscription (with plan and limits)
2. Count existing resources (`countActive()` on the relevant repository)
3. If `current >= max`, throw `PlanLimitError` (maps to HTTP 402)

This keeps the enforcement logic in one place and easy to test.

## Error mapping

Domain errors from `@saas/db` are caught by Fastify's global error handler and mapped to HTTP status codes:

| Error class | HTTP status |
|-------------|-------------|
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `ForbiddenError` | 403 |
| `PlanLimitError` | 402 |
| anything else | 500 |

In development, 500 responses include the stack trace. In production they return a generic message.

## Observability

- **Structured logging** — Pino logs every request, job, and error as JSON. In development, pino-pretty formats logs with colors.
- **Correlation IDs** — every request gets a unique `X-Request-Id` header (generated by Fastify's `genReqId`). It appears in logs and in the response header so you can trace a request across services.
- **Health check** — `GET /health` runs `SELECT 1` against the DB. Returns 503 if the pool is unreachable. Useful for load balancer health checks.
