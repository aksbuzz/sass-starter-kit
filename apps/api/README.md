# @saas/api — API Server

Fastify REST API. Handles authentication, workspace management, billing, and background job workers.

## Scripts

```bash
pnpm dev          # start API server in watch mode (tsx)
pnpm build        # compile TypeScript to dist/
pnpm start        # run compiled server
pnpm worker:dev   # start job worker in watch mode
pnpm worker:start # run compiled worker
pnpm test         # run unit tests (vitest)
pnpm test:watch   # vitest in watch mode
pnpm test:e2e     # run Cucumber E2E tests (requires running database)
pnpm lint         # eslint
```

## Architecture

The API is split into three logical layers (all in the same process):

| Layer | Path | Purpose |
|-------|------|---------|
| **Core** | `src/core/` | Auth, workspace context, shared hooks — always on |
| **Control plane** | `src/control-plane/` | Platform-admin routes (`/admin/*`) |
| **Modules** | `src/modules/` | Opt-in feature modules (toggle in `registry.ts`) |

The worker runs as a separate process (`src/worker/index.ts`).

## Routes

### Auth (`src/core/auth/`) — no authentication required

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/login/:provider` | Start OAuth flow (`google` or `github`) |
| GET | `/auth/callback/:provider` | OAuth callback, sets refresh token cookie |
| POST | `/auth/exchange` | Exchange code for access + refresh tokens |
| POST | `/auth/refresh` | Rotate session — new access + refresh tokens |
| POST | `/auth/workspace` | Select workspace, get token with tenantId + role |
| POST | `/auth/logout` | Delete session, clear cookie |
| POST | `/auth/impersonate` | Start impersonation session (platform admin only) |
| POST | `/auth/stop-impersonation` | End impersonation, restore admin session |

### Workspaces (`src/core/tenant/`) — requires authentication

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tenants` | List workspaces the current user belongs to |
| GET | `/tenants/me` | Current workspace context (tenant, subscription, flags) |
| PATCH | `/tenants/me` | Update workspace name or settings (admin+) |
| DELETE | `/tenants/me` | Soft-delete workspace (owner only) |

### Team module (`src/modules/team/`) — requires workspace context

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tenants/me/members` | List all members |
| GET | `/tenants/me/invitations` | List pending invitations |
| POST | `/tenants/me/invitations` | Invite a member by email (admin+) |
| DELETE | `/tenants/me/invitations/:invitationId` | Cancel invitation (admin+) |
| PATCH | `/tenants/me/members/:membershipId/role` | Change member role |
| DELETE | `/tenants/me/members/:membershipId` | Remove a member |
| GET | `/invitations/:token` | Look up invitation by token |
| POST | `/invitations/:token/accept` | Accept an invitation |

### Billing module (`src/modules/billing/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/plans` | List all active plans (public) |
| GET | `/billing/subscription` | Current subscription (authenticated) |
| POST | `/billing/checkout` | Create Stripe checkout session (admin+) |
| POST | `/billing/portal` | Create Stripe billing portal session (admin+) |
| POST | `/billing/webhook` | Stripe webhook receiver (no auth, HMAC verified) |

### API Keys module (`src/modules/api-keys/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api-keys` | List all active keys |
| POST | `/api-keys` | Create a new key (admin+) |
| DELETE | `/api-keys/:keyId` | Revoke a key (admin+) |

### Webhooks module (`src/modules/webhooks/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/webhooks` | List webhook endpoints |
| POST | `/webhooks` | Create a webhook endpoint (admin+) |
| PATCH | `/webhooks/:endpointId` | Update endpoint URL or events |
| DELETE | `/webhooks/:endpointId` | Delete a webhook endpoint |
| GET | `/webhooks/:endpointId/deliveries` | Recent delivery attempts |

### Feature flags module (`src/modules/feature-flags/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/feature-flags` | Resolve all flags for the current tenant |
| GET | `/feature-flags/:key` | Resolve a single flag |
| GET | `/feature-flags/overrides` | List tenant flag overrides (admin+) |
| PUT | `/feature-flags/overrides/:key` | Set a tenant override (admin+) |
| DELETE | `/feature-flags/overrides/:key` | Delete a tenant override (admin+) |

### Audit logs module (`src/modules/audit-logs/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit-logs` | Paginated log query with filters (admin+) |

### Control plane (`src/control-plane/`) — requires `ipa: true` in JWT

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/tenants` | List all tenants |
| POST | `/admin/tenants` | Create a tenant (provisions workspace + trial subscription) |
| GET | `/admin/tenants/:tenantId` | Get tenant details |
| PATCH | `/admin/tenants/:tenantId` | Update tenant |
| DELETE | `/admin/tenants/:tenantId` | Delete tenant |
| GET | `/admin/users` | List all users |
| GET | `/admin/stats` | Platform-wide stats |
| GET | `/admin/feature-flags` | List all platform-level flags |
| PUT | `/admin/feature-flags/:key` | Upsert a platform flag |
| DELETE | `/admin/feature-flags/:key` | Delete a platform flag |

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + DB readiness check |
| GET | `/docs` | Swagger UI (development only) |

## Roles

| Role | Capabilities |
|------|-------------|
| `member` | Read-only access to workspace data |
| `admin` | Create/modify resources, invite members, manage API keys and webhooks |
| `owner` | Everything admin + delete workspace, manage billing |

`requireRole('admin')` allows admin and owner. `requireRole('owner')` allows only owner.

## Adding a module

Create `src/modules/<name>/`:

```typescript
// src/modules/<name>/index.ts
import type { ApiModule } from '../types.js'
import { myRoutes }         from './routes.js'
import { registerMyModule } from './container.js'

export const myModule: ApiModule = {
  name:      'my-module',
  container: registerMyModule,
  routes:    myRoutes,
}
```

```typescript
// src/modules/<name>/routes.ts
import type { FastifyPluginAsync } from 'fastify'
import { authenticate }           from '../../core/hooks/authenticate.js'
import { requireRole }            from '../../core/hooks/require-role.js'
import { container }              from '../../container/index.js'
import { TOKENS }                 from '../../container/tokens.js'
import { MyService }              from './service.js'

const svc = container.get<MyService>(TOKENS.MyService)

export const myRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/my-resource', {
    preHandler: [authenticate],
    handler: async (req) => svc.list(req.ctx!),
  })

  fastify.post('/my-resource', {
    preHandler: [authenticate, requireRole('admin')],
    handler: async (req) => svc.create(req.ctx!, req.body as { name: string }),
  })
}
```

Then add `myModule` to `src/modules/registry.ts`.

## Toggling modules

Comment out a module in `src/modules/registry.ts` to disable it:

```typescript
export const enabledModules: ApiModule[] = [
  teamModule,
  // billingModule,   ← disabled: routes return 404, DI binding is skipped
  apiKeysModule,
]
```

## Job worker

The worker runs as a separate Node.js process (`src/worker/index.ts`). It polls several queues:

| Queue | Concurrency | Job types |
|-------|-------------|-----------|
| `email` | 5 | `email.send`, `invitation.send` |
| `webhook` | 10 | `webhook.deliver` |
| `stripe` | 5 | `stripe.sync-subscription`, `stripe.sync-customer` |
| `default` | 5 | fallback for all other job types |

To add a new job type:
1. Add the payload type to `packages/db/src/types.ts` (discriminated union in `JobPayload`)
2. Create a handler in `src/worker/handlers/`
3. Register the handler in `src/worker/index.ts`

## Tests

### Unit tests

Live in `src/tests/unit/`. Mock `@saas/db` entirely — no database connection needed.

```bash
pnpm test           # run once
pnpm test:watch     # watch mode
```

Pattern:
- `vi.hoisted()` creates mock repos before `vi.mock()` factories run
- Services are constructed directly: `new TeamService(logger)` — no Inversify container
- Error assertions use `toMatchObject({ name: 'ErrorName' })` — error classes are stubbed in the mock

### E2E tests (Cucumber)

Live in `e2e/`. Require a real database. The app starts in-process via Fastify's `inject()` — no port is opened.

```bash
pnpm test:e2e
```

| Path | Contents |
|------|---------|
| `e2e/features/` | Gherkin feature files |
| `e2e/step-definitions/` | Step implementations |
| `e2e/support/hooks.ts` | BeforeAll/AfterAll — builds the Fastify app |
| `e2e/support/db-helpers.ts` | Seed helpers: users, tenants, sessions, tokens |
| `e2e/support/world.ts` | E2EWorld — shared state per scenario |
