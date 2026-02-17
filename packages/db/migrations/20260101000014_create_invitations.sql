-- migrate:up
CREATE TABLE invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  -- Email address being invited (may not have a users row yet)
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'admin', 'member')),
  token       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Re-inviting the same address must explicitly cancel or let the old one expire first.
  CONSTRAINT invitations_tenant_email_unique UNIQUE (tenant_id, email)
);

CREATE INDEX idx_invitations_token      ON invitations (token);
CREATE INDEX idx_invitations_expires_at ON invitations (expires_at)
  WHERE accepted_at IS NULL;

-- migrate:down
DROP TABLE IF EXISTS invitations;
