-- migrate:up

-- One active subscription per tenant. Mirrors the Stripe Subscription object
-- Source of truth for gating: always read tenant's plan from this table,
CREATE TABLE subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id                 UUID        NOT NULL REFERENCES plans(id)   ON DELETE RESTRICT,
  stripe_customer_id      TEXT        UNIQUE,
  stripe_subscription_id  TEXT        UNIQUE,

  status                  TEXT        NOT NULL DEFAULT 'trialing'
                                      CHECK (status IN (
                                        'trialing', 'active', 'past_due',
                                        'canceled', 'unpaid', 'incomplete'
                                      )),

  billing_cycle           TEXT        NOT NULL DEFAULT 'monthly'
                                      CHECK (billing_cycle IN ('monthly', 'yearly')),

  trial_ends_at           TIMESTAMPTZ,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,

  cancel_at               TIMESTAMPTZ,
  canceled_at             TIMESTAMPTZ,
  stripe_data             JSONB       NOT NULL DEFAULT '{}',

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subscriptions_tenant_unique UNIQUE (tenant_id)
);

SELECT apply_updated_at('subscriptions');

-- migrate:down
DROP TABLE IF EXISTS subscriptions;
