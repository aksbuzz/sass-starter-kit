# Custom Postgres image with pg_cron pre-installed.
# pg_cron must be in shared_preload_libraries, so we need it at image build time.
FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       # pg_cron from the official PGDG repo (already configured in postgres:16 image)
       postgresql-16-cron \
    && rm -rf /var/lib/apt/lists/*
