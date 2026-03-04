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
requirePlatformAdmin hook ──→  checks ctx.isPlatformAdmin (from JWT ipa claim)
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

## Control plane vs app plane

The API is split into two planes:

| Plane | Routes | Guard |
|-------|--------|-------|
| **Control plane** | `/admin/*` | `requirePlatformAdmin` — JWT must carry `ipa: true` |
| **App plane (core)** | `/auth/*`, `/tenants/*` | `authenticate` — always available |
| **App plane (modules)** | `/tenants/me/members`, `/billing/*`, etc. | `requireRole` — tenant context required |

Control plane operations (tenant provisioning, user management, platform feature flags) are only accessible to platform admins. Tenant creation has moved entirely to `POST /admin/tenants` — regular users cannot self-provision workspaces. Non-admin users with no workspaces see an empty-state message instead.

The `ipa` (isPlatformAdmin) claim is baked into the access token at login time from `users.is_platform_admin`. It is preserved across token refreshes and workspace selection but is always set to `false` for impersonation sessions.

### Web module system

The frontend mirrors the API's layered structure. Each feature module exports a `WebModule`:

```typescript
export interface WebModule {
  name:     string
  routes:   RouteConfig[]   // { path, component } — registered in router.tsx
  navItems: NavItem[]       // { href, label, icon } — rendered in Sidebar.tsx
}
```

`apps/web/src/modules/registry.ts` holds the list of enabled web modules. The router and sidebar read from this registry at startup, so toggling a module removes its page routes and nav entry automatically.

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

## Layered module system

The codebase is split into three logical layers. All layers live in the same process and the same deployable — the separation is organisational, not infrastructural.

```
apps/api/src/
  core/                ← always on; auth + tenant context
    auth/              ← OAuth, JWT, sessions, token exchange
    tenant/            ← workspace CRUD, workspace selection, context
    hooks/             ← authenticate, requireRole, requirePlatformAdmin
    container.ts       ← buildCoreContainer() — DI bindings for core services
    types.ts           ← RequestContext and shared types

  control-plane/       ← platform-admin-only operations
    routes.ts          ← /admin/* routes (guarded by requirePlatformAdmin)
    service.ts         ← AdminService — tenant provisioning, user management, platform flags
    container.ts       ← registerControlPlane(container)

  modules/             ← opt-in feature modules
    types.ts           ← ApiModule interface { name, container?, routes }
    registry.ts        ← enabledModules[] — comment/uncomment to toggle
    team/              ← member invitations, role management
    billing/           ← Stripe subscriptions, plan management
    api-keys/          ← HMAC API key issuance and revocation
    webhooks/          ← webhook endpoints and delivery
    feature-flags/     ← per-tenant flag overrides
    audit-logs/        ← audit log querying and archival
```

### Module interface

Every pluggable module exports an object that satisfies `ApiModule`:

```typescript
export interface ApiModule {
  name:       string
  container?: (container: Container) => void  // optional DI bindings
  routes:     FastifyPluginAsync               // Fastify route plugin
}
```

### Module registry

`modules/registry.ts` is the single place where modules are enabled or disabled:

```typescript
export const enabledModules: ApiModule[] = [
  teamModule,
  billingModule,
  apiKeysModule,
  webhooksModule,
  featureFlagsModule,
  auditLogsModule,
]
```

Comment out a line to remove a module's routes and DI bindings from the running app.

### Container build order

`container/index.ts` wires everything in three layers:

```typescript
const container = buildCoreContainer()   // 1. core services (Auth, Tenant, DB pools)
registerControlPlane(container)           // 2. AdminService
for (const mod of enabledModules) {
  mod.container?.(container)             // 3. per-module services (Billing, ApiKey, …)
}
```

## Dependency injection

We use Inversify with constructor injection. Tokens are defined in `container/tokens.ts`.

```typescript
// Defining a service
@injectable()
export class ApiKeyService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}
}

// Binding it (inside the module's container.ts)
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
