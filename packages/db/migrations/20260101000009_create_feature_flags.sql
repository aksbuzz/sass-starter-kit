-- migrate:up

-- Feature flags with three-level resolution (highest priority wins):
--   1. tenant override  (scope_type = 'tenant', scope_id = tenant.id)
--   2. plan default     (scope_type = 'plan',   scope_id = plan.id)
--   3. global default   (scope_type = 'global', scope_id = NULL)
CREATE TABLE feature_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL,

  scope_type  TEXT        NOT NULL DEFAULT 'global'
                          CHECK (scope_type IN ('global', 'plan', 'tenant')),
  scope_id    UUID,
  enabled     BOOLEAN     NOT NULL DEFAULT false,
  config      JSONB       NOT NULL DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT apply_updated_at('feature_flags');

CREATE UNIQUE INDEX idx_feature_flags_global_key
  ON feature_flags (key)
  WHERE scope_type = 'global';

CREATE UNIQUE INDEX idx_feature_flags_scoped_key
  ON feature_flags (key, scope_id)
  WHERE scope_type != 'global';

-- migrate:down
DROP TABLE IF EXISTS feature_flags;
