-- migrate:up

CREATE TABLE api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  created_by   UUID        REFERENCES users(id)             ON DELETE SET NULL,
  name         TEXT        NOT NULL,
  prefix       TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  scopes       TEXT[]      NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key_hash    ON api_keys (key_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_api_keys_tenant_id   ON api_keys (tenant_id);

-- migrate:down
DROP TABLE IF EXISTS api_keys;
