-- migrate:up
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;

-- app_user may only INSERT a delivery if the endpoint belongs to the current tenant.
-- In practice, deliveries are inserted by the worker via adminSql (BYPASSRLS),
-- but this policy provides defence-in-depth if app_user ever needs to write here.
CREATE POLICY webhook_deliveries_insert ON webhook_deliveries
  FOR INSERT
  TO app_user
  WITH CHECK (
    endpoint_id IN (
      SELECT id FROM webhook_endpoints
      WHERE tenant_id = current_tenant_id()
    )
  );

-- migrate:down
DROP POLICY IF EXISTS webhook_deliveries_insert ON webhook_deliveries;
