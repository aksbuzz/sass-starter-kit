-- migrate:up

-- Role hierarchy (highest → lowest):
--   owner  — full control, can delete tenant, transfer ownership
--   admin  — manage users, billing, settings; cannot delete tenant
--   member — access according to feature flags and resource-level permissions
CREATE TABLE memberships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,

  role       TEXT        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('owner', 'admin', 'member')),

  status     TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'suspended')),

  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT memberships_tenant_user_unique UNIQUE (tenant_id, user_id)
);

SELECT apply_updated_at('memberships');

-- migrate:down
DROP TABLE IF EXISTS memberships;
