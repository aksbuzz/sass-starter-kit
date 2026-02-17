-- migrate:up

-- Partitioned by created_at (monthly ranges) so:
--   - Old partitions can be detached and archived to S3 without downtime
--   - Queries scoped to a date range only scan the relevant partition(s)
--   - Partition drop is instant (no per-row DELETE overhead)
--
-- Intentionally NO foreign keys to tenants/users:
--   - Audit records must survive tenant deletion for compliance
--   - user_id may be NULL for system-initiated actions
CREATE TABLE audit_logs (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  user_id       UUID,
  -- Dot-namespaced action: '<resource>.<verb>' e.g. 'users.create', 'subscriptions.upgrade'
  action        TEXT        NOT NULL,
  -- PascalCase resource name: 'User', 'Subscription', 'ApiKey'
  resource_type TEXT        NOT NULL,
  resource_id   TEXT,
  before        JSONB,
  after         JSONB,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2025_09 PARTITION OF audit_logs FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE audit_logs_2025_10 PARTITION OF audit_logs FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE audit_logs_2025_12 PARTITION OF audit_logs FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
-- pg_cron (migration 20) auto-creates subsequent months

ALTER TABLE audit_logs ADD PRIMARY KEY (id, created_at);

CREATE INDEX idx_audit_logs_tenant_created
  ON audit_logs (tenant_id, created_at DESC);

CREATE INDEX idx_audit_logs_action
  ON audit_logs (action, created_at DESC);

-- migrate:down
DROP TABLE IF EXISTS audit_logs;
