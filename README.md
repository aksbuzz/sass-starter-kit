# SaaS Starter Kit

A production-ready monorepo for building multi-tenant SaaS products. Includes authentication, billing, team management, background jobs, webhooks, API keys, audit logs, and a platform admin control plane — all wired together and ready to extend.

## What is included

- **Authentication** — Google and GitHub OAuth, JWT access tokens, rotating refresh tokens
- **Multi-tenancy** — workspaces with Row Level Security, owner/admin/member roles
- **Billing** — Stripe subscriptions, checkout and portal sessions, plan limits enforced at service layer
- **API keys** — create and revoke keys with HMAC-SHA256 hashing, plan limits
- **Webhooks** — outbound HTTP delivery with HMAC signing, retry via job queue
- **Background jobs** — poll-based queue backed by PostgreSQL (no Redis needed)
- **Audit logs** — every write recorded with before/after state, impersonation metadata included
- **Feature flags** — per-tenant and per-plan flag overrides
- **Platform admin** — control plane for managing all tenants and users; impersonation with 2-hour TTL and full audit trail

## Tech stack

| Layer | Technology |
|-------|-----------|
| API server | [Fastify](https://fastify.dev) |
| Frontend | React 18, Vite, TanStack Router, Redux Toolkit |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL (RLS, advisory locks) |
| Dependency injection | Inversify |
| Logging | Pino |
| Unit tests | Vitest |
| E2E tests (API) | Cucumber / BDD |
| E2E tests (web) | Playwright |
| Package manager | pnpm (monorepo) |
| Build | Turborepo |

## Project structure

```
sass-starter-kit/
├── apps/
│   ├── api/          — Fastify REST API + background job worker
│   └── web/          — React frontend (admin control plane + tenant app)
├── packages/
│   ├── db/           — DB client, migrations, repositories, domain types
│   ├── ui/           — Shared UI component library (shadcn/ui)
│   └── config/       — Shared constants (ROUTES, API_PATHS, cookie names)
├── docs/
│   ├── architecture.md   — Request lifecycle, RLS, auth, module system
│   ├── deployment.md     — Docker, env vars, production checklist
│   └── adr/              — Architecture Decision Records
├── .env.example      — All required environment variables
└── pnpm-workspace.yaml
```

### API layer (`apps/api/src/`)

The API is organised into three logical layers — everything runs in a single process:

```
core/                ← always-on auth and tenant infrastructure
  auth/              ← OAuth, token exchange, session rotation, impersonation
  tenant/            ← workspace CRUD, workspace selection, context loading
  hooks/             ← authenticate, requireRole, requirePlatformAdmin preHandlers
  container.ts       ← buildCoreContainer() — DI bindings for core services
  types.ts           ← RequestContext and shared types

control-plane/       ← platform-admin-only operations (guarded by requirePlatformAdmin)
  routes.ts          ← /admin/* routes
  service.ts         ← AdminService — tenant provisioning, user management, platform flags
  container.ts       ← registerControlPlane(container)

modules/             ← opt-in feature modules; toggle by editing registry.ts
  registry.ts        ← enabledModules[] — comment out to disable a module
  team/              ← member invitations, role changes
  billing/           ← Stripe subscriptions, checkout, billing portal
  api-keys/          ← HMAC key issuance and revocation
  webhooks/          ← outbound HTTP delivery endpoints
  feature-flags/     ← per-tenant flag overrides
  audit-logs/        ← audit log query and archival

worker/              ← background job worker (separate process)
  handlers/          ← one handler per job type
```

### Web layer (`apps/web/src/`)

Mirrors the API's layered structure:

```
core/                ← auth flow, workspace picker, dashboard shell
modules/             ← one folder per feature module (pages + nav items)
  registry.ts        ← enabledModules[] — comment out to disable a module
control-plane/       ← platform admin pages (tenant list, user management)
```

The router and sidebar read from `modules/registry.ts` at startup, so disabling a module removes its routes and nav entry automatically.

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

Minimum required values:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Admin Postgres connection (migrations, cross-tenant ops) |
| `DATABASE_APP_URL` | App-user Postgres connection (RLS-enforced queries) |
| `JWT_SECRET` | Any long random string (≥ 32 chars) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials (or GitHub equivalents) |
| `STRIPE_SECRET_KEY` | Stripe key (test mode for development) |
| `ENCRYPTION_KEY` | 64-char hex key for encrypting stored secrets |

**3. Set up the database**

```bash
cd packages/db
pnpm db:migrate   # runs dbmate migrations
pnpm db:seed      # inserts starter plan and default feature flags
```

**4. Start everything**

```bash
# from repo root — starts API + web in watch mode via Turborepo
pnpm dev
```

API listens on `http://localhost:3001`, web on `http://localhost:3000`.

**5. Start the job worker (separate process)**

```bash
cd apps/api
pnpm worker:dev
```

## Running tests

```bash
# Unit tests (no database required)
cd apps/api && pnpm test

# API E2E tests (requires running database)
cd apps/api && pnpm test:e2e

# Web E2E tests (requires running API + web servers)
cd apps/web && pnpm test:e2e
```

## Adding a new module

Create a folder in `apps/api/src/modules/<your-module>/`:

```
your-module/
  service.ts     ← business logic
  routes.ts      ← FastifyPluginAsync with your endpoints
  container.ts   ← export registerYourModule(container: Container)
  index.ts       ← export yourModule satisfies ApiModule
```

Then add `yourModule` to `apps/api/src/modules/registry.ts` and the corresponding `WebModule` to `apps/web/src/modules/registry.ts`.

## Disabling a module

Comment out the module in both registry files:

```typescript
// apps/api/src/modules/registry.ts
export const enabledModules: ApiModule[] = [
  teamModule,
  // billingModule,   ← disabled
  apiKeysModule,
]
```

The module's routes return 404 and its nav entry disappears from the sidebar automatically.

## Key concepts

**Multi-tenancy with RLS**
Each query runs as `app_user`. Before each query, `withTenant()` sets `app.current_tenant_id` so PostgreSQL RLS policies automatically filter rows.

**Two-phase authentication**
1. OAuth → `POST /auth/exchange` → access token (no workspace yet)
2. Workspace selection → `POST /auth/workspace` → new token with `tenantId + role`

**Platform admin**
Users with `is_platform_admin = TRUE` access `/admin/*` routes. The flag can only be set by a direct database write — no API surface to prevent privilege escalation.

```sql
UPDATE users SET is_platform_admin = TRUE WHERE email = 'support@yourcompany.com';
```

**Background jobs**
Jobs are rows in the `jobs` table. Workers claim them with `SELECT ... FOR UPDATE SKIP LOCKED`. No Redis or external queue needed.

## License

MIT
