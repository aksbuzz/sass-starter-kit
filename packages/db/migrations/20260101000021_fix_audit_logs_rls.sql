-- migrate:up
-- Allow app_user to insert audit logs for the current tenant.
-- The initial RLS policy only allowed SELECT; services that manually create
-- audit entries (API key creation, tenant provisioning, etc.) need INSERT too.
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  TO app_user
  WITH CHECK (tenant_id = current_tenant_id());

-- migrate:down
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
