-- migrate:up

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION apply_updated_at(target_table TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER set_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    target_table
  );
END;
$$;


CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _tenant_id  UUID;
  _user_id    UUID;
  _action     TEXT;
  _before     JSONB;
  _after      JSONB;
BEGIN
  _tenant_id := nullif(current_setting('app.current_tenant_id', true), '')::UUID;
  _user_id   := nullif(current_setting('app.current_user_id',   true), '')::UUID;

  IF (TG_OP = 'DELETE') THEN
    _action := TG_TABLE_NAME || '.delete';
    _before := to_jsonb(OLD);
    _after  := NULL;
  ELSIF (TG_OP = 'UPDATE') THEN
    _action := TG_TABLE_NAME || '.update';
    _before := to_jsonb(OLD);
    _after  := to_jsonb(NEW);
  ELSE
    _action := TG_TABLE_NAME || '.create';
    _before := NULL;
    _after  := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, before, after)
  VALUES (
    _tenant_id,
    _user_id,
    _action,
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN (OLD.id)::TEXT ELSE (NEW.id)::TEXT END,
    _before,
    _after
  );

  RETURN NULL;
END;
$$;

-------------------------------------------------------------------------------
-- Function: create a new monthly partition for audit_logs.
-- Called by pg_cron on the 25th of each month to pre-create next month's partition.
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_next_audit_partition()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  next_month      DATE := date_trunc('month', NOW() + interval '1 month');
  partition_name  TEXT := 'audit_logs_' || to_char(next_month, 'YYYY_MM');
  range_start     TEXT := to_char(next_month, 'YYYY-MM-DD');
  range_end       TEXT := to_char(next_month + interval '1 month', 'YYYY-MM-DD');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I
       PARTITION OF audit_logs
       FOR VALUES FROM (%L) TO (%L)',
    partition_name, range_start, range_end
  );
END;
$$;

-- migrate:down
DROP FUNCTION IF EXISTS create_next_audit_partition();
DROP FUNCTION IF EXISTS audit_log_changes();
DROP FUNCTION IF EXISTS apply_updated_at(TEXT);
DROP FUNCTION IF EXISTS set_updated_at();
