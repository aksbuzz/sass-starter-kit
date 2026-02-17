-- migrate:up
-------------------------------------------------------------------------------
-- users
-- A user can see themselves, OR any user who shares a tenant with them.
-- Writes are restricted to the user's own row only.
-------------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_read ON users
  FOR SELECT
  TO app_user
  USING (
    id = current_user_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id
        AND m.tenant_id = current_tenant_id()
        AND m.status = 'active'
    )
  );

CREATE POLICY users_write ON users
  FOR ALL
  TO app_user
  USING  (id = current_user_id())
  WITH CHECK (id = current_user_id());

-------------------------------------------------------------------------------
-- oauth_accounts
-- A user can only see/modify their own OAuth accounts.
-------------------------------------------------------------------------------
ALTER TABLE oauth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY oauth_accounts_rls ON oauth_accounts
  FOR ALL
  TO app_user
  USING  (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

-- migrate:down
ALTER TABLE oauth_accounts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oauth_accounts_rls ON oauth_accounts;

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_write ON users;
DROP POLICY IF EXISTS users_read  ON users;
