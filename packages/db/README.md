# @saas/db — Database Package

Raw SQL migrations (dbmate), typed postgres.js client, and schema documentation.

## Quick start

```bash
# Start Postgres with pg_cron (from repo root)
pnpm docker:up

# Run all migrations
pnpm db:migrate

# Check migration status
pnpm db:status

# Create a new migration
pnpm db:new add_tenant_custom_domains
```

## Tools

| Tool | Role |
|---|---|
| [dbmate](https://github.com/amacneil/dbmate) | Migration runner — language-agnostic, raw SQL files |
| [postgres.js](https://github.com/porsager/postgres) | DB client — tagged template literals, connection pooling |
| pg_cron | Scheduled jobs inside Postgres (no external cron) |

## Migration order

| # | File | What it creates |
|---|---|---|
| 01 | `create_extensions` | pgcrypto, pg_stat_statements, pg_cron |
| 02 | `create_utility_functions` | `set_updated_at()`, `audit_log_changes()`, `create_next_audit_partition()` |
| 03 | `create_tenants` | Core multi-tenancy entity, isolation mode |
| 04 | `create_users` | Platform-level user identity (no passwords) |
| 05 | `create_oauth_accounts` | Google/GitHub OAuth links, encrypted tokens |
| 06 | `create_memberships` | User↔Tenant RBAC join (owner/admin/member) |
| 07 | `create_plans` | Subscription plan definitions with limits/features |
| 08 | `create_subscriptions` | Stripe subscription mirror, one per tenant |
| 09 | `create_feature_flags` | 3-level flag resolution (global → plan → tenant) |
| 10 | `create_sessions` | UNLOGGED sessions table (replaces Redis) |
| 11 | `create_cache` | UNLOGGED cache table with tag invalidation (replaces Redis) |
| 12 | `create_jobs` | SKIP LOCKED job queue (replaces BullMQ/RabbitMQ) |
| 13 | `create_audit_logs` | Partitioned audit trail (replaces DynamoDB) |
| 14 | `create_invitations` | Pending user invitations with expiring tokens |
| 15 | `create_api_keys` | Programmatic API keys (SHA-256 hashed) |
| 16 | `create_webhooks` | Outbound webhook endpoints + delivery log |
| 17 | `create_indexes` | Composite and supporting indexes |
| 18 | `create_rls_policies` | Row Level Security for tenant isolation |
| 19 | `create_pg_cron_jobs` | Scheduled maintenance (cleanup, retry, expiry) |
| 20 | `seed_plans_and_flags` | Starter/Growth/Enterprise plans + feature flags |

## Tenant isolation strategy

```
Plan        Isolation     How
──────────  ────────────  ──────────────────────────────────────────────
Starter     RLS           SET LOCAL app.current_tenant_id = '<uuid>'
Growth      RLS           SET LOCAL app.current_tenant_id = '<uuid>'
Enterprise  schema        SET LOCAL search_path = 'tenant_<slug>', public
```

Upgrade path: a background job (`jobs` table, type `tenant.provision-schema`)
copies data to a new schema, then flips `tenants.isolation_mode = 'schema'`
and `tenants.schema_name` in a single transaction.

## Postgres-for-everything pattern map

| Would normally use | Using instead | Key technique |
|---|---|---|
| Redis (sessions) | `sessions` UNLOGGED table | TTL column + pg_cron cleanup |
| Redis (cache) | `cache` UNLOGGED table | Tag-based invalidation, TTL + pg_cron |
| Redis (pub/sub) | `LISTEN/NOTIFY` | `pg_notify()` in triggers |
| RabbitMQ / BullMQ | `jobs` table | `SELECT FOR UPDATE SKIP LOCKED` |
| DynamoDB (audit) | `audit_logs` partitioned table | Monthly RANGE partitions |
| External cron | `pg_cron` | Runs inside Postgres |
| Redis (dist locks) | `pg_advisory_lock()` | Session-scoped, auto-released on crash |

## Feature flag resolution

```sql
-- Resolve a flag for a tenant currently on a plan:
SELECT enabled, config
FROM   feature_flags
WHERE  key = 'sso'
  AND (
    (scope_type = 'tenant' AND scope_id = $tenant_id)
    OR (scope_type = 'plan'   AND scope_id = $plan_id)
    OR  scope_type = 'global'
  )
ORDER BY CASE scope_type
  WHEN 'tenant' THEN 1
  WHEN 'plan'   THEN 2
  ELSE               3
END
LIMIT 1;
```

## Environment variables

See `../../.env.example`.

- `DATABASE_URL` — admin URL for dbmate migrations (BYPASSRLS)
- `DATABASE_APP_URL` — restricted URL for the API server (subject to RLS)
