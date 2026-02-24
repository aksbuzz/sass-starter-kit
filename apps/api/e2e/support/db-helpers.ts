import { adminSql }            from '@saas/db'
import type { FastifyInstance } from 'fastify'
import type { User, Session, Tenant, MemberRole } from '@saas/db'

export async function seedUser(overrides: Partial<{ email: string; name: string }> = {}): Promise<User> {
  const email = overrides.email ?? `test-${Date.now()}@example.com`
  const name  = overrides.name  ?? 'Test User'

  const [user] = await adminSql<User[]>`
    INSERT INTO users (email, email_verified, name)
    VALUES (${email}, true, ${name})
    RETURNING *
  `
  return user!
}

export async function seedTenant(overrides: Partial<{ slug: string; name: string }> = {}): Promise<Tenant> {
  const slug = overrides.slug ?? `tenant-${Date.now()}`
  const name = overrides.name ?? 'Test Tenant'

  const [tenant] = await adminSql<Tenant[]>`
    INSERT INTO tenants (slug, name)
    VALUES (${slug}, ${name})
    RETURNING *
  `
  return tenant!
}

export async function seedMembership(tenantId: string, userId: string, role = 'owner'): Promise<string> {
  const [row] = await adminSql<[{ id: string }]>`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES (${tenantId}, ${userId}, ${role})
    RETURNING id
  `
  return row!.id
}


// For workspace sessions supply tenantId + data with role/planId/planSlug.
export interface SeedSessionOptions {
  userId:    string
  tenantId?: string | null
  data?:     Record<string, unknown>
  expiresIn?: number  // seconds from now, default 7 days
}

export async function seedSession(opts: SeedSessionOptions): Promise<Session> {
  const expiresAt = new Date(Date.now() + (opts.expiresIn ?? 7 * 24 * 3600) * 1000)
  const data      = opts.data ?? {}

  const [session] = await adminSql<Session[]>`
    INSERT INTO sessions (user_id, tenant_id, data, ip_address, user_agent, expires_at)
    VALUES (
      ${opts.userId},
      ${opts.tenantId ?? null},
      ${adminSql.json(data as unknown as Parameters<(typeof adminSql)['json']>[0])},
      '127.0.0.1',
      'cucumber-e2e',
      ${expiresAt}
    )
    RETURNING *
  `;
  return session!
}

export function makeAccessToken(
  app:       FastifyInstance,
  userId:    string,
  sessionId: string,
  tenantId:  string | null = null,
  role:      MemberRole  | null = null,
): string {
  return app.jwt.sign(
    { purpose: 'access', sub: userId, sid: sessionId, tid: tenantId, role },
    { expiresIn: '15m' },
  )
}

export function makeRefreshToken(
  app:       FastifyInstance,
  userId:    string,
  sessionId: string,
): string {
  return app.jwt.sign(
    { purpose: 'refresh', sub: userId, sid: sessionId },
    { expiresIn: '7d' },
  )
}


let _starterPlanId: string | null = null

export async function getStarterPlanId(): Promise<string> {
  if (_starterPlanId) return _starterPlanId
  const [row] = await adminSql<[{ id: string }]>`
    SELECT id FROM plans WHERE slug = 'starter' LIMIT 1
  `
  if (!row) throw new Error('Starter plan not found — run db:seed first')
  _starterPlanId = row.id
  return _starterPlanId
}


// Preserve plans and feature_flags (seeded once; expensive to recreate).
export async function cleanDatabase(): Promise<void> {
  await adminSql`
    TRUNCATE TABLE
      audit_logs,
      webhook_deliveries,
      webhook_endpoints,
      api_keys,
      jobs,
      cache,
      sessions,
      invitations,
      feature_flags,
      subscriptions,
      memberships,
      tenants,
      oauth_accounts,
      users
    RESTART IDENTITY CASCADE
  `

  await adminSql`
    INSERT INTO plans (name, slug, tier, isolation_mode, limits, features, is_public, is_active)
    VALUES
      ('Starter',    'starter',    1, 'rls',    '{"maxMembers":5,"maxApiKeys":3,"maxWebhooks":3,"storageBytes":null}',  '{"sso":false,"customDomain":false,"prioritySupport":false,"auditLogDays":7,"webhooks":true,"advancedAnalytics":false}',  true, true),
      ('Growth',     'growth',     2, 'rls',    '{"maxMembers":25,"maxApiKeys":10,"maxWebhooks":10,"storageBytes":null}', '{"sso":false,"customDomain":true,"prioritySupport":false,"auditLogDays":30,"webhooks":true,"advancedAnalytics":true}',   true, true),
      ('Enterprise', 'enterprise', 3, 'schema', '{"maxMembers":null,"maxApiKeys":100,"maxWebhooks":100,"storageBytes":null}', '{"sso":true,"customDomain":true,"prioritySupport":true,"auditLogDays":365,"webhooks":true,"advancedAnalytics":true}', false, true)
    ON CONFLICT (slug) DO NOTHING
  `

  // Invalidate cached plan id so next test picks it up fresh
  _starterPlanId = null
}

export async function ensureAuditPartition(): Promise<void> {
  await adminSql`SELECT create_next_audit_partition()`
}
