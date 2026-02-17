-- migrate:up
-- All jobs run in the saas_dev database as the saas_admin user (BYPASSRLS).
-------------------------------------------------------------------------------
-- Session cleanup — remove expired sessions every 15 minutes.
-- UNLOGGED tables lose data on crash anyway, so aggressive cleanup is fine.
-------------------------------------------------------------------------------
SELECT cron.schedule(
  'cleanup-sessions',
  '*/15 * * * *',
  $$DELETE FROM sessions WHERE expires_at < NOW()$$
);

-------------------------------------------------------------------------------
-- Cache TTL eviction — remove expired cache entries every 5 minutes.
-------------------------------------------------------------------------------
SELECT cron.schedule(
  'cleanup-cache',
  '*/5 * * * *',
  $$DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < NOW()$$
);

-------------------------------------------------------------------------------
-- Expired invitation cleanup — remove unaccepted invites after expiry.
-- Keep a 24h grace period so expiry error messages still make sense to users.
-------------------------------------------------------------------------------
SELECT cron.schedule(
  'cleanup-invitations',
  '0 3 * * *',
  $$DELETE FROM invitations WHERE accepted_at IS NULL AND expires_at < NOW() - INTERVAL '24 hours'$$
);

-------------------------------------------------------------------------------
-- Failed job retry with exponential backoff.
-- Reschedules failed jobs that still have attempts remaining.
-- Backoff: 2^attempts minutes (1m, 2m, 4m, 8m, 16m ...).
-- Runs every minute; only touches rows that are due for retry.
-------------------------------------------------------------------------------
SELECT cron.schedule(
  'retry-failed-jobs',
  '* * * * *',
  $$
    UPDATE jobs
       SET status = 'pending',
           run_at = NOW() + (POWER(2, attempts) * INTERVAL '1 minute')
     WHERE status = 'failed'
       AND attempts < max_attempts
       AND (run_at + (POWER(2, attempts) * INTERVAL '1 minute')) <= NOW()
  $$
);

-------------------------------------------------------------------------------
-- Stale processing job recovery — jobs that have been 'processing' for > 10 minutes
-- are assumed to have come from a crashed worker and are reset to 'pending'.
-------------------------------------------------------------------------------
SELECT cron.schedule(
  'recover-stale-jobs',
  '*/10 * * * *',
  $$
    UPDATE jobs
       SET status = 'pending',
           started_at = NULL
     WHERE status = 'processing'
       AND started_at < NOW() - INTERVAL '10 minutes'
  $$
);

-------------------------------------------------------------------------------
-- Audit log partition pre-creation — runs on the 25th of each month at 00:00.
-- Creates next month's partition so there's no gap at month rollover.
-------------------------------------------------------------------------------
SELECT cron.schedule(
  'create-audit-partition',
  '0 0 25 * *',
  $$SELECT create_next_audit_partition()$$
);

-------------------------------------------------------------------------------
-- Trial expiry — suspend tenants whose trial has ended and who haven't subscribed.
-- Runs daily at 01:00 UTC.
-------------------------------------------------------------------------------
SELECT cron.schedule(
  'expire-trials',
  '0 1 * * *',
  $$
    UPDATE tenants t
       SET status = 'suspended',
           updated_at = NOW()
      FROM subscriptions s
     WHERE s.tenant_id = t.id
       AND s.status = 'trialing'
       AND s.trial_ends_at < NOW()
       AND t.status = 'trialing'
  $$
);

-- migrate:down
SELECT cron.unschedule('expire-trials');
SELECT cron.unschedule('create-audit-partition');
SELECT cron.unschedule('recover-stale-jobs');
SELECT cron.unschedule('retry-failed-jobs');
SELECT cron.unschedule('cleanup-invitations');
SELECT cron.unschedule('cleanup-cache');
SELECT cron.unschedule('cleanup-sessions');
