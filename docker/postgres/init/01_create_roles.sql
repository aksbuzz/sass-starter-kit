-- Runs once when the Docker container is first created.
-- Creates application database roles with least-privilege access.
-- The saas_admin superuser (POSTGRES_USER) is used only for migrations.

-- app_user: the role the API server connects as.
-- Subject to RLS; cannot modify schema or bypass policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE saas_dev TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Future tables/sequences created by saas_admin will be accessible to app_user
ALTER DEFAULT PRIVILEGES FOR ROLE saas_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE saas_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Audit log partition tables are created dynamically by pg_cron.
-- Grant on them automatically via the default privilege above.
