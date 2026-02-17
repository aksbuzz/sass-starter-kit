-- migrate:up
CREATE TABLE jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Logical queue name (workers subscribe to a specific queue)
  queue        TEXT        NOT NULL DEFAULT 'default',
  -- Machine-readable job type (determines which handler processes it)
  type         TEXT        NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN (
                             'pending', 'processing', 'completed', 'failed', 'cancelled'
                           )),
  priority     SMALLINT    NOT NULL DEFAULT 0,
  attempts     SMALLINT    NOT NULL DEFAULT 0,
  max_attempts SMALLINT    NOT NULL DEFAULT 3,
  run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error        JSONB,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT apply_updated_at('jobs');

CREATE INDEX idx_jobs_worker_poll
  ON jobs (queue, priority DESC, run_at ASC)
  WHERE status = 'pending';

-- migrate:down
DROP TABLE IF EXISTS jobs;
