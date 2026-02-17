-- migrate:up

-- The old constraint prevents re-inviting an email that was previously accepted
-- or expired.  Replace with a partial unique index that only covers pending
-- (not-yet-accepted) invitations, so admins can re-invite after removal.
ALTER TABLE invitations
  DROP CONSTRAINT invitations_tenant_email_unique;

CREATE UNIQUE INDEX idx_invitations_tenant_email_pending
  ON invitations (tenant_id, email)
  WHERE accepted_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS idx_invitations_tenant_email_pending;

ALTER TABLE invitations
  ADD CONSTRAINT invitations_tenant_email_unique UNIQUE (tenant_id, email);
