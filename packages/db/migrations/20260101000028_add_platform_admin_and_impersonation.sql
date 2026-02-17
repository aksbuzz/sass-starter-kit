-- migrate:up
ALTER TABLE users
  ADD COLUMN is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: only platform admins are indexed (fast lookup, tiny index)
CREATE INDEX idx_users_platform_admin ON users (id) WHERE is_platform_admin = TRUE;

-- migrate:down
DROP INDEX IF EXISTS idx_users_platform_admin;
ALTER TABLE users DROP COLUMN IF EXISTS is_platform_admin;
