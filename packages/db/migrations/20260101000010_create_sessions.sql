-- migrate:up

-- UNLOGGED: skips WAL entirely, giving Redis-comparable write throughput.
CREATE UNLOGGED TABLE sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  ip_address  INET,
  user_agent  TEXT,

  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX idx_sessions_user_id    ON sessions (user_id);

-- migrate:down
DROP TABLE IF EXISTS sessions;
