# ADR-0004: PostgreSQL-based job queue (no external broker)

## Status

Accepted

## Context

The platform requires an asynchronous job queue for the following workloads:

| Job type | Characteristics |
|----------|----------------|
| Send invitation email | Low volume, latency-tolerant (seconds) |
| Deliver webhook | I/O-bound, moderate volume, retry required |
| Stripe billing sync | Low volume, idempotency important |
| Archive audit logs | Scheduled, low frequency, long-running |
| Provision tenant schema | One-shot, must be durable, failure is costly |

All of these require:
- **Durability** — jobs must survive a process crash
- **At-least-once delivery** — a failed job must be retried
- **Backoff** — repeated failures should not hammer the target
- **Concurrency control** — multiple workers must not double-process a job

External brokers (Redis/BullMQ, RabbitMQ, Kafka, AWS SQS) provide these guarantees well but add an infrastructure component. The question is whether PostgreSQL alone is sufficient.

## Decision

Implement the job queue entirely in PostgreSQL using:

1. **`jobs` table** as the queue backing store
2. **`SELECT … FOR UPDATE SKIP LOCKED`** for race-free job claiming
3. **`pg_cron`** for retry scheduling and stale-job cleanup
4. **Exponential backoff** computed in the `fail()` function and stored as `run_after`
5. **`JobWorker` class** that polls on a configurable interval per queue

### Schema (simplified)

```sql
CREATE TABLE jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  queue       TEXT NOT NULL DEFAULT 'default',
  payload     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  attempts    INT  NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  run_after   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Claim flow (SKIP LOCKED)

```sql
WITH next AS (
  SELECT id FROM jobs
  WHERE  queue  = $queue
    AND  status = 'pending'
    AND  run_after <= NOW()
  ORDER BY run_after
  LIMIT  $concurrency
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs SET status = 'processing', attempts = attempts + 1
WHERE id IN (SELECT id FROM next)
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` skips rows already locked by another worker process. This is safe for multi-process workers without any application-level locking.

### Retry with exponential backoff

```sql
-- fail() sets run_after using DB attempts count (not application-supplied value)
UPDATE jobs
SET status    = 'failed',
    error     = jsonb_build_object('message', $msg, 'attempt', attempts),
    run_after = NOW() + (INTERVAL '1 second' * POWER(2, attempts))
WHERE id = $id;
```

`pg_cron` resets `failed` jobs back to `pending` where `attempts < max_attempts`, allowing the worker to pick them up again.

### Worker architecture

```
JobWorker (one per queue)
  ├── pollMs: configurable (default 1 000ms, webhook queue uses higher concurrency)
  ├── concurrency: configurable (default 5, webhook queue uses 10)
  └── poll():
        1. Claim up to $concurrency pending jobs (SKIP LOCKED)
        2. For each claimed job: call handler(job.type, job.payload)
        3. On success: UPDATE status = 'completed'
        4. On error:   fail(id, error.message)  →  exponential backoff
```

Workers run in the same process as the API server. There is no separate worker binary. The `apps/api/src/worker/index.ts` starts workers when the process boots.

### Queue configuration

| Queue | Concurrency | Use |
|-------|-------------|-----|
| `default` | 5 | emails, billing sync, schema provisioning |
| `webhooks` | 10 | webhook delivery (I/O-bound, benefits from parallelism) |

## Consequences

### Positive

- **Transactional enqueue** — `INSERT INTO jobs` participates in the same transaction as the business operation. If the transaction rolls back, the job does not exist. Zero dual-write risk.
- **No additional infrastructure** — no Redis, no RabbitMQ, no SQS. One fewer component to deploy, monitor, and pay for (see ADR-0001).
- **ACID durability** — jobs are as durable as the database. A process crash mid-job leaves the row in `processing` status; `pg_cron` resets stale `processing` jobs back to `pending` after a timeout.
- **Observability** — job state is directly queryable with SQL. A simple `SELECT status, count(*) FROM jobs GROUP BY status` shows the queue health instantly.
- **SKIP LOCKED is production-grade** — used by major ORMs and queue libraries (Sidekiq, Delayed::Job, pg-boss). It is not an ad-hoc hack.

### Negative

- **Polling adds baseline DB load** — each `JobWorker` instance runs a poll query every `pollMs` milliseconds regardless of whether there are jobs. At two workers × 1 000ms = ~2 queries/second idle. Acceptable, but not free.
- **Not suitable for very high throughput** — above ~1 000 jobs/second, `SKIP LOCKED` contention on the `jobs` table becomes a bottleneck. For reference, the platform's expected peak is tens to hundreds of jobs/minute.
- **No push notification** — `LISTEN/NOTIFY` could eliminate polling but adds connection management complexity and is not currently implemented. Jobs have up to `pollMs` latency from enqueue to processing.
- **`pg_cron` must be installed** — requires the `pg_cron` extension, which is available in all major managed PostgreSQL services (RDS, Cloud SQL, Supabase, Neon) but needs to be enabled in the migration.
- **Stale `processing` jobs require cleanup** — if a worker process is killed mid-job, the row stays in `processing` indefinitely until `pg_cron` resets it. The cleanup interval must be tuned to `max_job_duration + buffer`.

### Neutral

- Each job type has a dedicated handler function in `apps/api/src/worker/handlers/`. Adding a new job type requires a new handler file and registration in the worker's dispatch map.
- Job payloads are JSONB, so schema is flexible. There is no compile-time validation of payload shape (mitigated with TypeScript types on the handler signature).

## Alternatives Considered

**BullMQ + Redis**
- Rejected at this stage: requires Redis, which is not otherwise needed (ADR-0001). BullMQ is excellent and would be the first choice if Redis were already in the stack. Revisit if job throughput exceeds PostgreSQL's capacity.

**pg-boss**
- Considered: a well-maintained PostgreSQL queue library that handles SKIP LOCKED, retries, scheduling, and singleton jobs. Rejected in favour of a custom implementation for full control over the schema, retry logic, and integration with `withAdmin()`. The custom implementation is small enough (~200 LOC) that the maintenance burden is low.

**Temporal**
- Rejected: Temporal is a workflow orchestration engine (durable execution), not a simple job queue. It requires its own server deployment and is appropriate for long-running, multi-step workflows. The current job types are simple fire-and-forget tasks with at-most 3 retries.

**AWS SQS / GCP Pub/Sub**
- Rejected: vendor-specific; adds cloud provider lock-in and requires outbound network calls to enqueue. Transactional enqueue is not possible. Appropriate for platforms already committed to a specific cloud provider.

**Sidekiq / Celery (language-native queues)**
- Not applicable: the API is Node.js. Node equivalents (BullMQ, Bee-Queue) require Redis.

## References

- [PostgreSQL FOR UPDATE SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [pg_cron extension](https://github.com/citusdata/pg_cron)
- `packages/db/migrations/20260101000012_create_jobs.sql` — jobs table schema
- `packages/db/migrations/20260101000019_create_pg_cron_jobs.sql` — cron job definitions
- `apps/api/src/worker/job-worker.ts` — JobWorker class
- `apps/api/src/worker/handlers/` — all job handlers
