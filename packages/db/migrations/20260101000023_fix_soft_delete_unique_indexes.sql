-- migrate:up
-- This allows re-registration / re-creation after a soft delete.

-------------------------------------------------------------------------------
-- tenants.slug
-------------------------------------------------------------------------------
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_slug_key;

CREATE UNIQUE INDEX idx_tenants_slug_active
  ON tenants (slug)
  WHERE deleted_at IS NULL;

-------------------------------------------------------------------------------
-- users.email
-------------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;

CREATE UNIQUE INDEX idx_users_email_active
  ON users (email)
  WHERE deleted_at IS NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_users_email_active;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

DROP INDEX IF EXISTS idx_tenants_slug_active;
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
