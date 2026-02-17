-- migrate:up

-- isolation_mode drives how the tenant's data is stored:
--   'rls'    — shared public schema, Row Level Security filters by tenant_id (default, Starter/Growth)
--   'schema' — dedicated schema tenant_<slug> with no RLS overhead (Enterprise upgrade)
CREATE TABLE tenants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  isolation_mode  TEXT        NOT NULL DEFAULT 'rls'
                              CHECK (isolation_mode IN ('rls', 'schema')),

  schema_name     TEXT        UNIQUE,
  status          TEXT        NOT NULL DEFAULT 'trialing'
                              CHECK (status IN ('trialing', 'active', 'suspended', 'deleted')),

  settings        JSONB       NOT NULL DEFAULT '{}',
  metadata        JSONB       NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT tenants_slug_unique UNIQUE (slug)
);

SELECT apply_updated_at('tenants');

-- migrate:down
DROP TABLE IF EXISTS tenants;
