-- migrate:up

CREATE TABLE oauth_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  provider         TEXT        NOT NULL CHECK (provider IN ('google', 'github')),
  provider_user_id TEXT        NOT NULL,
  provider_email   TEXT,

  -- Stored as pgp_sym_encrypt(token, $ENCRYPTION_KEY)::TEXT 
  access_token_enc  TEXT,
  refresh_token_enc TEXT,
  token_expires_at  TIMESTAMPTZ,

  raw_profile      JSONB       NOT NULL DEFAULT '{}',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT oauth_accounts_provider_user_unique UNIQUE (provider, provider_user_id)
);

SELECT apply_updated_at('oauth_accounts');

-- migrate:down
DROP TABLE IF EXISTS oauth_accounts;
