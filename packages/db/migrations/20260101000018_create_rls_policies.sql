-- migrate:up
-- Row Level Security policies — the primary tenant isolation mechanism for
-- all tenants on the 'rls' isolation mode (Starter / Growth plans).

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::UUID;
$$;

-------------------------------------------------------------------------------
-- tenants
-- A user can only see/modify the tenant they are currently operating as.
-------------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_rls ON tenants
  FOR ALL
  TO app_user
  USING (id = current_tenant_id());

-------------------------------------------------------------------------------
-- memberships
-- A user sees only memberships belonging to their current tenant.
-------------------------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_rls ON memberships
  FOR ALL
  TO app_user
  USING (tenant_id = current_tenant_id());

-------------------------------------------------------------------------------
-- subscriptions
-------------------------------------------------------------------------------
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_rls ON subscriptions
  FOR ALL
  TO app_user
  USING (tenant_id = current_tenant_id());

-------------------------------------------------------------------------------
-- feature_flags
-------------------------------------------------------------------------------
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_read ON feature_flags
  FOR SELECT
  TO app_user
  USING (
    scope_type = 'global'
    OR scope_type = 'plan'
    OR (scope_type = 'tenant' AND scope_id = current_tenant_id())
  );

CREATE POLICY feature_flags_write ON feature_flags
  FOR ALL
  TO app_user
  USING  (scope_type = 'tenant' AND scope_id = current_tenant_id())
  WITH CHECK (scope_type = 'tenant' AND scope_id = current_tenant_id());

-------------------------------------------------------------------------------
-- sessions
-------------------------------------------------------------------------------
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY sessions_rls ON sessions
  FOR ALL
  TO app_user
  USING (user_id = current_user_id());

-------------------------------------------------------------------------------
-- invitations
-------------------------------------------------------------------------------
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_rls ON invitations
  FOR ALL
  TO app_user
  USING (tenant_id = current_tenant_id());

-- Token-based lookup (unauthenticated invite acceptance) bypasses RLS at the
-- application layer by using a short-lived saas_admin connection for that
-- single query, then switching to app_user once tenant context is established.

-------------------------------------------------------------------------------
-- api_keys
-------------------------------------------------------------------------------
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY api_keys_rls ON api_keys
  FOR ALL
  TO app_user
  USING (tenant_id = current_tenant_id());

-------------------------------------------------------------------------------
-- webhook_endpoints
-------------------------------------------------------------------------------
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_rls ON webhook_endpoints
  FOR ALL
  TO app_user
  USING (tenant_id = current_tenant_id());

-------------------------------------------------------------------------------
-- webhook_deliveries
-------------------------------------------------------------------------------
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_read ON webhook_deliveries
  FOR SELECT
  TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM webhook_endpoints e
      WHERE e.id = endpoint_id
        AND e.tenant_id = current_tenant_id()
    )
  );

-------------------------------------------------------------------------------
-- audit_logs
-------------------------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT
  TO app_user
  USING (tenant_id = current_tenant_id());

-- No INSERT/UPDATE/DELETE policy for app_user:
-- audit_log_changes() function is SECURITY DEFINER and writes as saas_admin.

-- migrate:down
-- RLS is dropped automatically with tables.
DROP FUNCTION IF EXISTS current_user_id();
DROP FUNCTION IF EXISTS current_tenant_id();
