-- migrate:up

-------------------------------------------------------------------------------
-- tenants
-------------------------------------------------------------------------------

-- Exclude soft-deleted tenants from normal queries
CREATE INDEX idx_tenants_status
  ON tenants (status)
  WHERE deleted_at IS NULL;

-- Admin dashboard: filter by isolation mode (to track schema-migration progress)
CREATE INDEX idx_tenants_isolation_mode
  ON tenants (isolation_mode)
  WHERE deleted_at IS NULL;

-------------------------------------------------------------------------------
-- users
-------------------------------------------------------------------------------

-- Email lookup for OAuth sign-in (most common auth query)
CREATE INDEX idx_users_email
  ON users (email)
  WHERE deleted_at IS NULL;

-------------------------------------------------------------------------------
-- memberships
-------------------------------------------------------------------------------

-- "Which tenants does user X belong to?" — used on login to list workspaces
CREATE INDEX idx_memberships_user_id
  ON memberships (user_id)
  WHERE status = 'active';

-- "Who are the members of tenant X?" — used in admin member list
CREATE INDEX idx_memberships_tenant_id
  ON memberships (tenant_id)
  WHERE status = 'active';

-- RBAC check: "Is user X an owner/admin of tenant Y?"
CREATE INDEX idx_memberships_tenant_role
  ON memberships (tenant_id, role)
  WHERE status = 'active';

-------------------------------------------------------------------------------
-- subscriptions
-------------------------------------------------------------------------------

-- Stripe webhook handler: map stripe_customer_id → tenant
CREATE INDEX idx_subscriptions_stripe_customer
  ON subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Billing dashboard: filter by subscription status
CREATE INDEX idx_subscriptions_status
  ON subscriptions (status);

-- Trial expiry job: find trialing subs whose trial has ended
CREATE INDEX idx_subscriptions_trial_ends_at
  ON subscriptions (trial_ends_at)
  WHERE status = 'trialing';

-------------------------------------------------------------------------------
-- feature_flags
-------------------------------------------------------------------------------

-- Flag resolution query: WHERE key = $k AND scope_type IN (...) AND scope_id IN (...)
CREATE INDEX idx_feature_flags_key_scope
  ON feature_flags (key, scope_type, scope_id);

-------------------------------------------------------------------------------
-- jobs
-------------------------------------------------------------------------------

-- Dead-letter / monitoring: find persistently failing jobs
CREATE INDEX idx_jobs_failed
  ON jobs (queue, updated_at DESC)
  WHERE status = 'failed';

-- Scheduled job lookup: processing jobs whose lock may have expired
CREATE INDEX idx_jobs_stale_processing
  ON jobs (started_at)
  WHERE status = 'processing';

-------------------------------------------------------------------------------
-- oauth_accounts
-------------------------------------------------------------------------------

-- OAuth sign-in: provider + provider_user_id lookup
CREATE INDEX idx_oauth_accounts_provider
  ON oauth_accounts (provider, provider_user_id);

-- Lookup all OAuth accounts for a user (account settings page)
CREATE INDEX idx_oauth_accounts_user_id
  ON oauth_accounts (user_id);

-------------------------------------------------------------------------------
-- api_keys
-------------------------------------------------------------------------------

-- Expiry enforcement: find keys that have expired (cron cleanup or auth check)
CREATE INDEX idx_api_keys_expires_at
  ON api_keys (expires_at)
  WHERE expires_at IS NOT NULL AND revoked_at IS NULL;

-- migrate:down
