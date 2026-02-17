-- migrate:up

-- UNLOGGED: WAL-free, fast writes. Acceptable because cache is always
-- reconstructable from the primary data source.
CREATE UNLOGGED TABLE cache (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  tags       TEXT[]      NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cache_expires_at ON cache (expires_at)
  WHERE expires_at IS NOT NULL;

-- Tag-based invalidation: WHERE tags && ARRAY['tenant:uuid']
CREATE INDEX idx_cache_tags ON cache USING gin (tags);

-- migrate:down
DROP TABLE IF EXISTS cache;
