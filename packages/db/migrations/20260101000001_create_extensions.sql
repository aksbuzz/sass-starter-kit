-- migrate:up

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- migrate:down

