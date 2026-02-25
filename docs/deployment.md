# Deployment

This guide covers deploying the API server and job worker to a production environment. The setup assumes Linux containers (Docker or similar) and a managed PostgreSQL database.

## What you need

- A PostgreSQL 15+ database (e.g. AWS RDS, Supabase, Neon, Railway)
- A server or container runtime (e.g. AWS ECS, Fly.io, Render, Railway)
- A Stripe account with a webhook endpoint configured
- An SMTP provider for transactional email (SES, SendGrid, Postmark, Mailgun)

## Build

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
```

This compiles TypeScript to `apps/api/dist/` and `packages/*/dist/`.

## Database setup

Run migrations against your production database using the admin connection string:

```bash
DATABASE_URL=postgresql://saas_admin:...@prod-host:5432/saas_prod \
  pnpm --filter @saas/db db:migrate
```

After the first deployment also run seeds to insert the default plans and feature flags:

```bash
DATABASE_URL=... pnpm --filter @saas/db db:seed
```

### Postgres users

The production database needs two roles:

**`saas_admin`** — used for migrations and the job worker. Must have `BYPASSRLS` and full table privileges.

**`app_user`** — used for all API server queries. Must have basic read/write but NOT `BYPASSRLS`. RLS policies use this role to enforce tenant isolation.

See `packages/db/db/roles.sql` for the exact `CREATE ROLE` statements.

## Environment variables

Copy `.env.example` and fill in all values for production. Important notes:

- `NODE_ENV` must be `production`
- `JWT_SECRET` must be a long random string (32+ bytes). Changing it invalidates all existing sessions.
- `ENCRYPTION_KEY` must be a 32-byte hex string. Changing it makes stored OAuth tokens unreadable.
- `DATABASE_URL` should be the **admin** connection string (BYPASSRLS)
- `DATABASE_APP_URL` should be the **app_user** connection string (RLS active)

Generate secure random values:

```bash
# JWT secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Encryption key (32 bytes = 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Webhook signing secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Running the API server

```bash
node apps/api/dist/main.js
```

The server listens on `0.0.0.0:$API_PORT` (default 3001). Run behind a reverse proxy (nginx, ALB, Cloudflare) that handles TLS.

## Running the job worker

The worker is a separate process. Run it alongside the API server:

```bash
node apps/api/dist/worker/index.js
```

You can run multiple worker processes safely — they use `SELECT ... FOR UPDATE SKIP LOCKED` so they never claim the same job.

## Health checks

Configure your load balancer or container orchestrator to poll:

```
GET /health
```

Returns 200 if the API server is running and can reach the database. Returns 503 if the database is unreachable. Pull the instance from rotation on 503.

## Stripe webhooks

In the Stripe dashboard, add a webhook endpoint pointing to:

```
https://your-api-domain.com/billing/webhook
```

Subscribe to these events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the webhook signing secret into the `STRIPE_WEBHOOK_SECRET` environment variable.

## OAuth redirect URIs

Add your production callback URLs in the Google and GitHub developer consoles:

```
https://your-api-domain.com/auth/callback/google
https://your-api-domain.com/auth/callback/github
```

## Recommended setup

**API server**: 2+ instances behind a load balancer. The application is stateless — sessions live in the database, not in memory.

**Job worker**: 1-2 instances. More workers is fine since the queue handles concurrency correctly, but usually one is enough to start.

**pg_cron**: Install the `pg_cron` extension on your PostgreSQL database to enable job retry scheduling. Without it, failed jobs will not be automatically retried.

```sql
-- Connect as superuser and enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

The retry cron job is created automatically by the migration that installs the jobs table.

## Docker example

A minimal `Dockerfile` for the API server:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile && pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

For the worker, change the `CMD` to `node dist/worker/index.js`.

## Logs

The API and worker write JSON logs to stdout. Ship them to your log aggregator (CloudWatch, Datadog, Grafana Loki, etc.).

Every log line contains `reqId` (request correlation ID). This matches the `X-Request-Id` response header, so you can find all logs for a specific request easily.

## Checklist before going live

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` is random and secret
- [ ] `ENCRYPTION_KEY` is random and secret
- [ ] `DATABASE_APP_URL` uses `app_user` (not admin)
- [ ] `STRIPE_WEBHOOK_SECRET` matches the Stripe dashboard
- [ ] OAuth redirect URIs are registered for production domain
- [ ] Health check is configured on load balancer
- [ ] pg_cron extension is installed for job retries
- [ ] SMTP is configured (or email delivery is skipped for early launch)
- [ ] Swagger UI is disabled (it is automatic when `NODE_ENV=production`)
