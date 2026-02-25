# @saas/api — API Server

Fastify REST API. Handles authentication, tenant management, billing, and background job workers.

## Scripts

```bash
pnpm dev          # start API server in watch mode (tsx)
pnpm build        # compile TypeScript to dist/
pnpm start        # run compiled server
pnpm worker:dev   # start job worker in watch mode
pnpm worker:start # run compiled worker
pnpm test         # run unit tests (vitest)
pnpm test:watch   # vitest in watch mode
pnpm lint         # eslint
```

## Routes

### Auth — no authentication required

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/login/:provider` | Start OAuth flow (provider: `google` or `github`) |
| GET | `/auth/callback/:provider` | OAuth callback, sets refresh token cookie |
| POST | `/auth/refresh` | Exchange refresh token for new access token |
| POST | `/auth/workspace` | Select a workspace, get access token with tenantId + role |
| POST | `/auth/logout` | Delete session, clear cookie |

### Tenants — requires authentication + workspace selected

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tenants` | Create a new workspace |
| GET | `/tenants/me` | Load current workspace (tenant, subscription, flags) |
| PATCH | `/tenants/me` | Update workspace name or settings (admin+) |
| DELETE | `/tenants/me` | Soft-delete workspace (owner only) |
| GET | `/tenants/me/members` | List all members |
| POST | `/tenants/me/invitations` | Invite a new member by email (admin+) |
| POST | `/tenants/me/invitations/accept` | Accept an invitation |
| PATCH | `/tenants/me/members/:membershipId/role` | Change member role (owner/admin/member) |
| DELETE | `/tenants/me/members/:membershipId` | Remove a member |

### Billing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/plans` | List all active plans (public) |
| GET | `/billing/subscription` | Current subscription and plan (authenticated) |
| POST | `/billing/checkout` | Create Stripe checkout session (admin+) |
| POST | `/billing/portal` | Create Stripe billing portal session (admin+) |
| POST | `/billing/webhook` | Stripe webhook receiver (no auth, HMAC verified) |

### API Keys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api-keys` | List all active keys |
| POST | `/api-keys` | Create a new key (admin+) |
| DELETE | `/api-keys/:keyId` | Revoke a key (admin+) |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/webhooks` | List webhook endpoints |
| POST | `/webhooks` | Create a webhook endpoint (admin+) |
| PATCH | `/webhooks/:endpointId` | Update endpoint URL or events |
| DELETE | `/webhooks/:endpointId` | Delete a webhook endpoint |
| GET | `/webhooks/:endpointId/deliveries` | Recent delivery attempts |

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + DB readiness check |
| GET | `/docs` | Swagger UI (development only) |

## Roles

Routes that need a specific role use the `requireRole` hook:

| Role | What can do |
|------|-------------|
| `member` | Read-only access to workspace data |
| `admin` | Create/modify resources, invite members, manage API keys |
| `owner` | Everything admin can do + delete workspace, manage billing |

`requireRole('admin')` allows both admin and owner. `requireRole('owner')` allows only owner.

## Adding a route

1. Create or open `src/routes/<domain>/index.ts`
2. Export a `FastifyPluginAsync`
3. Use `authenticate` as `preHandler` for protected routes
4. Use `requireRole('admin')` or `requireRole('owner')` for restricted ones
5. Register in `src/routes/index.ts`

Example:

```typescript
import type { FastifyPluginAsync } from 'fastify'
import { authenticate }  from '../../hooks/authenticate.js'
import { requireRole }   from '../../hooks/require-role.js'
import { container }     from '../../container/index.js'
import { TOKENS }        from '../../container/tokens.js'
import { MyService }     from '../../services/my.service.js'

const mySvc = container.get<MyService>(TOKENS.MyService)

export const myRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/my-resource', {
    preHandler: [authenticate],
    handler: async (request) => {
      return mySvc.list(request.ctx!)
    },
  })

  fastify.post('/my-resource', {
    preHandler: [authenticate, requireRole('admin')],
    handler: async (request) => {
      return mySvc.create(request.ctx!, request.body as { name: string })
    },
  })
}
```

## Job worker

The worker runs as a separate Node.js process (`src/worker/index.ts`). It polls several queues:

| Queue | Concurrency | Handlers |
|-------|-------------|----------|
| `email` | 5 | `invitation.send` |
| `webhook` | 10 | `webhook.deliver` |
| `stripe` | 5 | `stripe.sync-subscription`, `stripe.sync-customer` |
| `default` | 5 | all of the above as fallback |

To add a new job type:
1. Add the payload type to `packages/db/src/types.ts` (discriminated union in `JobPayload`)
2. Create a handler in `src/worker/handlers/`
3. Register the handler in `src/worker/index.ts`

## Tests

Unit tests live in `src/tests/unit/`. They mock `@saas/db` entirely (no database connection needed).

```bash
pnpm test               # run once
pnpm test:watch         # re-run on change
```

The test pattern:
- `vi.hoisted()` creates mock repositories before `vi.mock()` factories run
- Services are instantiated directly: `new TenantService(logger)` — no Inversify container
- Assertions use `toMatchObject({ name: 'ErrorName' })` instead of `instanceof` because error classes are stubbed in the mock
