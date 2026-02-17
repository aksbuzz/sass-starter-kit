import type { Sql, TransactionSql } from 'postgres'
import { sql as appSql, adminSql } from './client.js'
import type { IsolationMode } from './types.js'
import { performance } from 'node:perf_hooks'
import { TenantsRepository }     from './repositories/tenants.js'
import { UsersRepository }       from './repositories/users.js'
import { OAuthAccountsRepository } from './repositories/oauth-accounts.js'
import { MembershipsRepository } from './repositories/memberships.js'
import { PlansRepository }       from './repositories/plans.js'
import { SubscriptionsRepository } from './repositories/subscriptions.js'
import { FeatureFlagsRepository } from './repositories/feature-flags.js'
import { SessionsRepository }    from './repositories/sessions.js'
import { CacheRepository }       from './repositories/cache.js'
import { JobsRepository }        from './repositories/jobs.js'
import { AuditLogsRepository }   from './repositories/audit-logs.js'
import { InvitationsRepository } from './repositories/invitations.js'
import { ApiKeysRepository }     from './repositories/api-keys.js'
import { WebhooksRepository }    from './repositories/webhooks.js'

// ── Optional metrics hooks (set by the API layer, keeps @saas/db free of prom-client) ──

export interface DbMetricsHooks {
  onTransactionComplete(type: 'tenant' | 'admin', durationMs: number): void
  onTransactionError(type: 'tenant' | 'admin', durationMs: number): void
}

let _metricsHooks: DbMetricsHooks | null = null

export function setDbMetricsHooks(hooks: DbMetricsHooks): void {
  _metricsHooks = hooks
}

export interface TenantContext {
  readonly tx: TransactionSql
  readonly tenantId: string
  readonly userId: string
  readonly repos: {
    // Tenant-scoped
    readonly memberships:  MembershipsRepository
    readonly featureFlags: FeatureFlagsRepository
    readonly sessions:     SessionsRepository
    readonly cache:        CacheRepository
    readonly jobs:         JobsRepository
    readonly auditLogs:    AuditLogsRepository
    readonly invitations:  InvitationsRepository
    readonly apiKeys:      ApiKeysRepository
    readonly webhooks:     WebhooksRepository
    // Global
    readonly tenants:      TenantsRepository
    readonly users:        UsersRepository
    readonly plans:        PlansRepository
    readonly subscriptions: SubscriptionsRepository
  }
}

// Schema names are always generated as tenant_<slug> — validate before interpolation.
const SCHEMA_NAME_RE = /^tenant_[a-z0-9_-]+$/

export async function withTenant<T>(
  opts: { tenantId: string; userId: string; sql?: Sql },
  fn: (ctx: TenantContext) => Promise<T>,
): Promise<T> {
  const [tenantRow] = await adminSql<Array<{ isolationMode: IsolationMode; schemaName: string | null }>>`
    SELECT isolation_mode AS "isolationMode", schema_name AS "schemaName"
    FROM tenants
    WHERE id = ${opts.tenantId} AND deleted_at IS NULL
  `
  const isolationMode = tenantRow?.isolationMode ?? 'rls'
  const schemaName    = tenantRow?.schemaName    ?? null

  const client = opts.sql ?? appSql
  const start  = performance.now()
  try {
    const result = await client.begin(async (tx) => {
      if (isolationMode === 'schema' && schemaName && SCHEMA_NAME_RE.test(schemaName)) {
        await tx.unsafe(`SET LOCAL search_path = "${schemaName}", public`)
      }

      await (tx as unknown as Sql)`SELECT set_config('app.current_tenant_id', ${opts.tenantId}, true)`
      await (tx as unknown as Sql)`SELECT set_config('app.current_user_id',   ${opts.userId},   true)`

      const ctx: TenantContext = {
        tx,
        tenantId: opts.tenantId,
        userId: opts.userId,
        repos: {
          memberships: new MembershipsRepository(tx as unknown as Sql),
          featureFlags: new FeatureFlagsRepository(tx as unknown as Sql),
          sessions: new SessionsRepository(tx as unknown as Sql),
          cache: new CacheRepository(tx as unknown as Sql),
          jobs: new JobsRepository(tx as unknown as Sql),
          auditLogs: new AuditLogsRepository(tx as unknown as Sql),
          invitations: new InvitationsRepository(tx as unknown as Sql),
          apiKeys: new ApiKeysRepository(tx as unknown as Sql),
          webhooks: new WebhooksRepository(tx as unknown as Sql),
          // Global
          tenants: new TenantsRepository(tx as unknown as Sql),
          users: new UsersRepository(tx as unknown as Sql),
          plans: new PlansRepository(tx as unknown as Sql),
          subscriptions: new SubscriptionsRepository(tx as unknown as Sql),
        },
      };
      return fn(ctx)
    }) as T
    _metricsHooks?.onTransactionComplete('tenant', performance.now() - start)
    return result
  } catch (err) {
    _metricsHooks?.onTransactionError('tenant', performance.now() - start)
    throw err
  }
}

export interface AdminContext {
  readonly tx: TransactionSql
  readonly repos: {
    readonly tenants:       TenantsRepository
    readonly users:         UsersRepository
    readonly oauthAccounts: OAuthAccountsRepository
    readonly memberships:   MembershipsRepository
    readonly plans:         PlansRepository
    readonly subscriptions: SubscriptionsRepository
    readonly featureFlags:  FeatureFlagsRepository
    readonly sessions:      SessionsRepository
    readonly jobs:          JobsRepository
    readonly auditLogs:     AuditLogsRepository
    readonly invitations:   InvitationsRepository
    readonly apiKeys:       ApiKeysRepository
    readonly webhooks:      WebhooksRepository
  }
}

export async function withAdmin<T>(
  fn: (ctx: AdminContext) => Promise<T>,
): Promise<T> {
  const start = performance.now()
  try {
    const result = await adminSql.begin(async (tx) => {
      const ctx: AdminContext = {
        tx,
        repos: {
          tenants:       new TenantsRepository(tx as unknown as Sql),
          users:         new UsersRepository(tx as unknown as Sql),
          oauthAccounts: new OAuthAccountsRepository(tx as unknown as Sql),
          memberships:   new MembershipsRepository(tx as unknown as Sql),
          plans:         new PlansRepository(tx as unknown as Sql),
          subscriptions: new SubscriptionsRepository(tx as unknown as Sql),
          featureFlags:  new FeatureFlagsRepository(tx as unknown as Sql),
          sessions:      new SessionsRepository(tx as unknown as Sql),
          jobs:          new JobsRepository(tx as unknown as Sql),
          auditLogs:     new AuditLogsRepository(tx as unknown as Sql),
          invitations:   new InvitationsRepository(tx as unknown as Sql),
          apiKeys:       new ApiKeysRepository(tx as unknown as Sql),
          webhooks:      new WebhooksRepository(tx as unknown as Sql),
        },
      }
      return fn(ctx)
    }) as T
    _metricsHooks?.onTransactionComplete('admin', performance.now() - start)
    return result
  } catch (err) {
    _metricsHooks?.onTransactionError('admin', performance.now() - start)
    throw err
  }
}

// withAdvisoryLock — distributed lock using Postgres advisory locks.
export async function withAdvisoryLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const reserved = await appSql.reserve()
  try {
    const [row] = await reserved<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS acquired
    `
    if (!row!.acquired) return null
    try {
      return await fn()
    } finally {
      await reserved`SELECT pg_advisory_unlock(hashtext(${lockKey}))`
    }
  } finally {
    reserved.release()
  }
}
