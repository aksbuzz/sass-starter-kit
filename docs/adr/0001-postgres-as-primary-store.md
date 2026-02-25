# ADR-0001: Use PostgreSQL for all persistence

## Status

Accepted

## Context

A SaaS platform needs persistent storage for multiple concerns that are often solved with different technologies:

- **Relational data** — users, tenants, memberships, subscriptions, plans
- **Session store** — short-lived auth sessions with fast lookup and expiry
- **Cache** — ephemeral key/value data (OAuth state, rate-limit counters, magic links)
- **Job queue** — durable async work with retry, backoff, and at-least-once delivery
- **Audit log** — append-only, high-volume, time-partitioned event records
- **Feature flags** — tenant-scoped overrides with global defaults

The standard polyglot answer is PostgreSQL + Redis + a message broker (e.g., RabbitMQ or Kafka). However, this multiplies the number of infrastructure components that must be deployed, secured, monitored, and kept available.

The team is small and optimising for operational simplicity at the early stage. PostgreSQL's feature set (JSONB, `FOR UPDATE SKIP LOCKED`, table partitioning, `pg_cron`, advisory locks, `LISTEN/NOTIFY`) covers all of the above concerns without an external dependency.

## Decision

Use PostgreSQL as the **only** persistence layer for the application. Specifically:

| Concern | Implementation |
|---------|---------------|
| Relational data | Standard tables with foreign keys and RLS |
| Sessions | `sessions` table; row deleted on logout |
| Cache | `cache` table with `expires_at`; expired rows cleaned by `pg_cron` |
| Job queue | `jobs` table with `FOR UPDATE SKIP LOCKED` and `pg_cron` retry (see ADR-0004) |
| Audit log | `audit_logs` partitioned by month; rows inserted via `saas_admin` role |
| Feature flags | `feature_flags` table with JSONB `config`; tenant overrides as separate rows |

Two connection pools exist in each process:

| Pool | Role | RLS |
|------|------|-----|
| `sql` | `app_user` | enforced |
| `adminSql` | `saas_admin` | bypassed |

Application queries use `sql` inside `withTenant()`. Migrations, background jobs, and cross-tenant admin operations use `adminSql` inside `withAdmin()`.

## Consequences

### Positive

- **One infrastructure component** — a single PostgreSQL instance (or managed cluster) is all that is needed to run the application. No Redis, no Kafka, no separate cache tier.
- **ACID guarantees everywhere** — enqueuing a job in the same transaction that creates a record means the job is guaranteed to exist if and only if the record exists. No dual-write race conditions.
- **Unified observability** — all data lives in one system; a single `pg_stat_activity` query shows every slow operation across all concerns.
- **Simpler local development** — `docker compose up` starts one container. No need for Redis, BullMQ worker sidecar, or message broker.
- **Familiar tooling** — migrations, backups, point-in-time recovery, replication, and schema inspection all use standard PostgreSQL tooling.
- **RLS enforced at DB level** — tenant isolation is guaranteed by the database engine, not by application code (see ADR-0002).

### Negative

- **Vertical scaling ceiling** — a single primary can be pushed to its limits before read replicas or sharding is needed. At very high throughput, the job queue and cache tables will create contention on the primary.
- **No pub/sub fan-out** — `LISTEN/NOTIFY` is available but limited to a single database connection per subscriber. Real-time fan-out to thousands of clients would require an intermediary.
- **Polling overhead** — the job worker polls on a fixed interval instead of being pushed a notification. At low volume this wastes queries; at high volume it adds latency.
- **Cache eviction is eventual** — expired rows are cleaned by `pg_cron`, not on write. A burst of writes could temporarily grow the `cache` table before the next sweep.

### Neutral

- Teams familiar with Redis or Kafka for queues and caching will need to adjust mental models.
- Managed PostgreSQL (RDS, Cloud SQL, Supabase) is widely available and cost-competitive with managed Redis + managed PostgreSQL together.

## Alternatives Considered

**Redis (cache + sessions + pub/sub)**
- Rejected at this stage: adds a second runtime dependency. Redis's fast key expiry and pub/sub are valuable but can be approximated well enough with PostgreSQL for the load levels expected at launch.
- Revisit: if cache read volume exceeds 10k req/s or real-time fan-out is required, add Redis alongside PostgreSQL.

**BullMQ / Redis for job queue**
- Rejected: requires Redis. See ADR-0004 for detailed job queue analysis.

**Apache Kafka / RabbitMQ (message broker)**
- Rejected: far more operational complexity than justified for a job queue that processes hundreds to low thousands of jobs per minute. Event sourcing is not a current requirement.

**SQLite (local dev only)**
- Rejected: RLS, `pg_cron`, `FOR UPDATE SKIP LOCKED`, and partitioning are PostgreSQL-specific. Maintaining parity with a different DB in development creates false confidence.

## References

- [PostgreSQL SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [pg_cron extension](https://github.com/citusdata/pg_cron)
- [Table partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- `packages/db/migrations/` — all schema definitions
- `packages/db/src/context.ts` — `withTenant` / `withAdmin` implementations
