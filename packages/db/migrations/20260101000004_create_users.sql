-- migrate:up
CREATE TABLE users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL,
  email_verified  BOOLEAN     NOT NULL DEFAULT false,
  name            TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT users_email_unique UNIQUE (email)
);

SELECT apply_updated_at('users');

-- migrate:down
DROP TABLE IF EXISTS users;
