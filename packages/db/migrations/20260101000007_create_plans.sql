-- migrate:up
CREATE TABLE plans (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT        NOT NULL,
  slug                    TEXT        NOT NULL UNIQUE,
  tier                    SMALLINT    NOT NULL,

  isolation_mode          TEXT        NOT NULL DEFAULT 'rls'
                                      CHECK (isolation_mode IN ('rls', 'schema')),
  price_monthly_cents     INT,
  price_yearly_cents      INT,
  stripe_price_monthly_id TEXT,
  stripe_price_yearly_id  TEXT,

  -- Hard limits applied at the API layer
  limits                  JSONB       NOT NULL DEFAULT '{}',
  features                JSONB       NOT NULL DEFAULT '{}',

  is_public               BOOLEAN     NOT NULL DEFAULT true,
  is_active               BOOLEAN     NOT NULL DEFAULT true,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT apply_updated_at('plans');

-- migrate:down
DROP TABLE IF EXISTS plans;
