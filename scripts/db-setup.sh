#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://saas_admin:saas_password@localhost:5432/saas_dev?sslmode=disable}"
APP_PASSWORD="${DB_APP_PASSWORD:-app_user_password}"

DB_HOST=$(echo "$DB_URL" | sed 's|postgresql://[^@]*@||' | sed 's|?.*||')
echo "→ Setting up roles and permissions → $DB_HOST"

psql "$DB_URL" <<SQL
-- Create app_user if it does not already exist
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('CREATE ROLE app_user LOGIN PASSWORD %L', '${APP_PASSWORD}');
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE CURRENT_CATALOG TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Tables and sequences created by the migration role will be accessible to app_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
SQL

echo "✓ Database setup complete"
