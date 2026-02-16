# SaaS Starter Kit

A production-ready starter for building multi-tenant SaaS products. It includes authentication, billing, team management, background jobs, webhooks, and API keys — all wired together and ready to extend.

## What is included

- **Authentication** — Google and GitHub OAuth, JWT access tokens, rotating refresh tokens
- **Multi-tenancy** — workspaces with Row Level Security, owner/admin/member roles
- **Billing** — Stripe subscriptions, checkout and portal sessions, plan limits enforced at service layer
- **API keys** — create and revoke keys with HMAC-SHA256 hashing, plan limits
- **Webhooks** — outbound HTTP delivery with HMAC signing, retry via job queue
- **Background jobs** — poll-based queue backed by PostgreSQL (no Redis needed)
- **Audit logs** — every write recorded with before/after state, impersonation metadata included
- **Feature flags** — per-tenant and per-plan flag overrides
- **Platform admin impersonation** — support staff can start a full session as any user, with audit trail and visual indicator

## Tech stack

| Layer | Technology |
|-------|-----------|
| API server | [Fastify](https://fastify.dev) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL (RLS, advisory locks, LISTEN/NOTIFY) |
| Dependency injection | Inversify |
| Logging | Pino |
| Testing | Vitest |
| Package manager | pnpm (monorepo) |
| Build | Turborepo |

## Project structure

```
sass-starter-kit/
├── apps/
│   ├── api/          — Fastify REST API server
│   └── web/          — Next.js frontend (coming next)
├── packages/
│   ├── db/           — DB client, migrations, repositories, types
│   └── config/       — Shared environment variable schema (Zod)
├── .env.example      — All required environment variables
└── pnpm-workspace.yaml
```

Inside `apps/api/src/`:

```
app.ts            — Fastify instance setup
main.ts           — Process entry point, graceful shutdown
config.ts         — Validated env vars (Zod schema)
container/        — Inversify DI container and token registry
hooks/            — authenticate, requireRole, requirePlatformAdmin preHandlers
plugins/          — Helmet, CORS, JWT, rate limiting, Swagger
routes/           — One folder per domain (auth, tenants, billing, ...)
services/         — Business logic layer (one class per domain)
worker/           — Background job workers and handlers
lib/              — Small utilities (email, OAuth, crypto, audit-helpers)
tests/            — Unit tests
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

## Local setup

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd sass-starter-kit
pnpm install
```

**2. Copy the environment file**

```bash
cp .env.example .env
```

Then fill in the values. The minimum required to start:

- `DATABASE_URL` and `DATABASE_APP_URL` — two Postgres connection strings (admin role and app role)
- `JWT_SECRET` — any long random string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` or GitHub equivalents

**3. Set up the database**

Run migrations to create all tables, RLS policies, and seed data:

```bash
cd packages/db
pnpm db:migrate   # runs dbmate migrations in db/migrations/
pnpm db:seed      # inserts starter plan and default feature flags
```

**4. Start the API server**

```bash
# from repo root
pnpm dev
```

This runs all packages in watch mode via Turborepo. The API listens on `http://localhost:3001` by default.

**5. Start the job worker (optional, separate process)**

```bash
cd apps/api
pnpm worker:dev
```

## Environment variables

See `.env.example` for all variables with descriptions. Key groups:

| Group | Variables |
|-------|-----------|
| Database | `DATABASE_URL`, `DATABASE_APP_URL`, pool settings |
| Auth | `JWT_SECRET`, `GOOGLE_*`, `GITHUB_*` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Email (optional) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| App | `NODE_ENV`, `API_PORT`, `WEB_URL`, `API_URL` |

If `SMTP_HOST` is not set, invitation emails are printed to stdout instead of sent. This is useful for development.

## Running tests

```bash
cd apps/api
pnpm test          # run all tests once
pnpm test:watch    # watch mode
```

Tests use Vitest with mocked repositories — no database connection required.

## API documentation

When `NODE_ENV` is not `production`, Swagger UI is available at:

```
http://localhost:3001/docs
```

## Database

The `packages/db` package exports everything the API needs:

- `withTenant(opts, fn)` — runs `fn` inside a transaction with RLS tenant context set
- `withAdmin(fn)` — runs `fn` with the admin connection (bypasses RLS)
- All repository classes (`TenantsRepository`, `MembershipsRepository`, etc.)
- Domain error classes (`NotFoundError`, `ConflictError`, `ForbiddenError`, `PlanLimitError`)

See `packages/db/README.md` for migration and schema details.

## Key concepts

**Multi-tenancy with RLS**
Each database query runs as `app_user`. Before each query, we set `app.current_tenant_id` so PostgreSQL RLS policies automatically filter rows. No manual `WHERE tenant_id = ?` needed.

**Authentication flow**
1. User completes OAuth → we create/update the user and session
2. We issue a short-lived access token (15 min) and a long-lived refresh token in an httpOnly cookie
3. On workspace selection (`POST /auth/workspace`), we patch the session and issue a new access token with `tenantId` and `role` inside
4. The `authenticate` hook reads `role` from the session record in the DB (not from the JWT), so role changes take effect immediately

**Background jobs**
Jobs are rows in the `jobs` table. Workers claim them with `SELECT ... FOR UPDATE SKIP LOCKED` so multiple workers never pick the same job. Failed jobs are retried by a pg_cron job using exponential backoff. No Redis or external queue required.

**Webhooks**
Outbound webhook delivery is a job in the `webhook` queue. The payload is signed with `HMAC-SHA256(secret, "{timestamp}.{body}")` so receivers can verify authenticity.

**Platform admin impersonation**
Users with `is_platform_admin = TRUE` in the database can start a session as any non-admin user via `POST /auth/impersonate`. The impersonation session is time-boxed to 2 hours, the admin's original session is preserved, and every action taken during impersonation records `impersonatedBy` in the audit log. The frontend shows a persistent amber banner while impersonation is active. Stop with `POST /auth/stop-impersonation`, which returns tokens for the original admin session. The flag is set directly in the database — there is no API to grant it.

```sql
UPDATE users SET is_platform_admin = TRUE WHERE email = 'support@yourcompany.com';
```

## Adding a new domain

1. Add a migration in `packages/db/db/migrations/`
2. Add a repository in `packages/db/src/repositories/`
3. Export from `packages/db/src/repositories/index.ts`
4. Add types to `packages/db/src/types.ts`
5. Create a service in `apps/api/src/services/`
6. Bind the service in `apps/api/src/container/index.ts`
7. Create routes in `apps/api/src/routes/<domain>/index.ts`
8. Register the routes in `apps/api/src/routes/index.ts`

## License

MIT
