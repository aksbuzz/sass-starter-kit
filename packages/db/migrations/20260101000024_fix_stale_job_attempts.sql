-- migrate:up
-- decrement attempts when recovering stale jobs.

SELECT cron.unschedule('recover-stale-jobs');

SELECT cron.schedule(
  'recover-stale-jobs',
  '*/10 * * * *',
  $$
    UPDATE jobs
       SET status     = 'pending',
           started_at = NULL,
           attempts   = GREATEST(0, attempts - 1)
     WHERE status = 'processing'
       AND started_at < NOW() - INTERVAL '10 minutes'
  $$
);

-- migrate:down
SELECT cron.unschedule('recover-stale-jobs');

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
