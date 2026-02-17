-- migrate:up
INSERT INTO plans (
  id, name, slug, tier, isolation_mode,
  price_monthly_cents, price_yearly_cents,
  limits, features,
  is_public, is_active
) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    'Starter',
    'starter',
    1,
    'rls',
    0,
    0,
    '{"max_members": 3, "max_api_keys": 2, "max_webhooks": 1, "storage_bytes": 1073741824}'::jsonb,
    '{"sso": false, "custom_domain": false, "priority_support": false, "audit_log_days": 30, "webhooks": false, "advanced_analytics": false}'::jsonb,
    true,
    true
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    'Growth',
    'growth',
    2,
    'rls',
    4900,
    47040,  -- ~20% annual discount
    '{"max_members": 25, "max_api_keys": 10, "max_webhooks": 5, "storage_bytes": 10737418240}'::jsonb,
    '{"sso": true, "custom_domain": false, "priority_support": false, "audit_log_days": 90, "webhooks": true, "advanced_analytics": false}'::jsonb,
    true,
    true
  ),
  (
    'e3000000-0000-0000-0000-000000000003',
    'Enterprise',
    'enterprise',
    3,
    'schema',
    29900,
    287040,  -- ~20% annual discount
    '{"max_members": null, "max_api_keys": 50, "max_webhooks": 20, "storage_bytes": null}'::jsonb,
    '{"sso": true, "custom_domain": true, "priority_support": true, "audit_log_days": 365, "webhooks": true, "advanced_analytics": true}'::jsonb,
    false,  -- not shown on public pricing page; sales-led
    true
  )
ON CONFLICT (slug) DO NOTHING;


INSERT INTO feature_flags (key, scope_type, scope_id, enabled, config) VALUES
  -- SSO / OAuth to tenant's own IdP (SAML, OIDC)
  ('sso',                 'global', NULL, false, '{}'),
  -- Custom domain mapping (e.g., app.acme.com → their tenant subdomain)
  ('custom_domain',       'global', NULL, false, '{}'),
  -- API key creation and usage
  ('api_access',          'global', NULL, true,  '{}'),
  -- Outbound webhooks
  ('webhooks',            'global', NULL, false, '{}'),
  -- Advanced usage analytics dashboard
  ('advanced_analytics',  'global', NULL, false, '{}'),
  -- Audit log access (how many days retained is in plan limits)
  ('audit_log',           'global', NULL, true,  '{}'),
  -- Priority support queue routing
  ('priority_support',    'global', NULL, false, '{}'),
  -- Schema-level tenant isolation (only Enterprise triggers migration job)
  ('schema_isolation',    'global', NULL, false, '{}')
ON CONFLICT DO NOTHING;

-- Plan-scoped feature flag overrides (mirrors plans.features JSONB for DB-query resolution)
INSERT INTO feature_flags (key, scope_type, scope_id, enabled, config) VALUES
  -- Growth plan
  ('sso',                 'plan', 'e2000000-0000-0000-0000-000000000002', true,  '{}'),
  ('webhooks',            'plan', 'e2000000-0000-0000-0000-000000000002', true,  '{}'),
  -- Enterprise plan
  ('sso',                 'plan', 'e3000000-0000-0000-0000-000000000003', true,  '{}'),
  ('custom_domain',       'plan', 'e3000000-0000-0000-0000-000000000003', true,  '{}'),
  ('webhooks',            'plan', 'e3000000-0000-0000-0000-000000000003', true,  '{}'),
  ('advanced_analytics',  'plan', 'e3000000-0000-0000-0000-000000000003', true,  '{}'),
  ('priority_support',    'plan', 'e3000000-0000-0000-0000-000000000003', true,  '{}'),
  ('schema_isolation',    'plan', 'e3000000-0000-0000-0000-000000000003', true,  '{}')
ON CONFLICT DO NOTHING;

-- migrate:down
DELETE FROM feature_flags WHERE scope_type IN ('global', 'plan') AND scope_id IN (
  'e2000000-0000-0000-0000-000000000002',
  'e3000000-0000-0000-0000-000000000003'
);
DELETE FROM feature_flags WHERE scope_type = 'global';
DELETE FROM plans WHERE slug IN ('starter', 'growth', 'enterprise');
