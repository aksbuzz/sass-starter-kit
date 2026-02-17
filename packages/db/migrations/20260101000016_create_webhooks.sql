-- migrate:up

-- Outbound webhooks: tenants subscribe to platform events and receive HTTP POST
-- callbacks to their own infrastructure.
CREATE TABLE webhook_endpoints (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  -- Subscribed event types: ['user.created', 'subscription.upgraded', 'member.invited']
  -- Empty array = subscribed to all events (wildcard)
  events     TEXT[]      NOT NULL DEFAULT '{}',
  secret     TEXT        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT apply_updated_at('webhook_endpoints');

CREATE TABLE webhook_deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id   UUID        NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  job_id        UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL,
  status_code   SMALLINT,
  response_body TEXT,
  duration_ms   INT,
  attempt       SMALLINT    NOT NULL DEFAULT 1,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_endpoints_tenant_id
  ON webhook_endpoints (tenant_id);

CREATE INDEX idx_webhook_deliveries_endpoint_id
  ON webhook_deliveries (endpoint_id, created_at DESC);

-- migrate:down
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;
