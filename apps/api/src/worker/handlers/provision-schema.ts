import { withAdmin, withAdvisoryLock, adminSql } from '@saas/db'
import type { JobHandler }                        from '../job-worker.js'
import type { JobPayload }                        from '@saas/db'

// ---------------------------------------------------------------------------
// Upgrades a tenant from shared RLS isolation to a dedicated PostgreSQL schema.
// Intended for Enterprise tier tenants where physical data separation is required.
//
// Tables migrated into the tenant schema (have tenant_id, are fully owned):
//   memberships, invitations, api_keys, webhook_endpoints, webhook_deliveries
//
// Tables that remain in public (cross-tenant or user-scoped):
//   tenants, users, plans, subscriptions, sessions, jobs, feature_flags,
//   cache, audit_logs  — these still use RLS in both isolation modes.
// ---------------------------------------------------------------------------

type Payload = Extract<JobPayload, { type: 'tenant.provision-schema' }>

const SCHEMA_NAME_RE = /^tenant_[a-z0-9_-]+$/

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const handleTenantProvisionSchema: JobHandler<Payload> = async (job, logger) => {
  const { tenantId } = job.payload

  const tenant = await withAdmin(async ({ repos }) =>
    repos.tenants.findByIdOrThrow(tenantId),
  )

  if (tenant.isolationMode === 'schema') {
    logger.warn({ tenantId, schemaName: tenant.schemaName }, 'Tenant already in schema isolation — skipping')
    return
  }

  const schemaName = `tenant_${tenant.slug.replace(/-/g, '_')}`

  if (!UUID_RE.test(tenantId))        throw new Error(`Invalid tenantId format: ${tenantId}`)
  if (!SCHEMA_NAME_RE.test(schemaName)) throw new Error(`Invalid schema name format: ${schemaName}`)

  logger.info({ tenantId, schemaName }, 'Starting schema provisioning')

  // Advisory lock — prevent concurrent runs
  const result = await withAdvisoryLock(`provision-schema:${tenantId}`, async () => {
    await adminSql.begin(async (tx) => {
      // Create schema and grant app_user USAGE.
      // DDL must use tx.unsafe() — identifier names cannot be parametrized.
      await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
      await tx.unsafe(`GRANT USAGE ON SCHEMA "${schemaName}" TO app_user`)

      const tables = ['memberships', 'invitations', 'api_keys', 'webhook_endpoints', 'webhook_deliveries']
      for (const table of tables) {
        await tx.unsafe(
          `CREATE TABLE IF NOT EXISTS "${schemaName}".${table} (LIKE public.${table} INCLUDING ALL)`,
        )
      }

      await tx.unsafe(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schemaName}" TO app_user`,
      )

      await tx.unsafe(`INSERT INTO "${schemaName}".memberships SELECT * FROM public.memberships WHERE tenant_id = $1`, [tenantId])
      await tx.unsafe(`INSERT INTO "${schemaName}".invitations SELECT * FROM public.invitations WHERE tenant_id = $1`, [tenantId])
      await tx.unsafe(`INSERT INTO "${schemaName}".api_keys SELECT * FROM public.api_keys WHERE tenant_id = $1`, [tenantId])
      await tx.unsafe(`INSERT INTO "${schemaName}".webhook_endpoints SELECT * FROM public.webhook_endpoints WHERE tenant_id = $1`, [tenantId])
      await tx.unsafe(
        `INSERT INTO "${schemaName}".webhook_deliveries
         SELECT wd.* FROM public.webhook_deliveries wd
         JOIN public.webhook_endpoints we ON wd.endpoint_id = we.id
         WHERE we.tenant_id = $1`,
        [tenantId],
      )

      await tx.unsafe(
        `UPDATE tenants SET isolation_mode = 'schema', schema_name = $1, updated_at = NOW() WHERE id = $2`,
        [schemaName, tenantId],
      )

      await tx.unsafe(
        `DELETE FROM public.webhook_deliveries WHERE endpoint_id IN (SELECT id FROM public.webhook_endpoints WHERE tenant_id = $1)`,
        [tenantId],
      )
      await tx.unsafe(`DELETE FROM public.webhook_endpoints WHERE tenant_id = $1`, [tenantId])
      await tx.unsafe(`DELETE FROM public.api_keys           WHERE tenant_id = $1`, [tenantId])
      await tx.unsafe(`DELETE FROM public.invitations        WHERE tenant_id = $1`, [tenantId])
      await tx.unsafe(`DELETE FROM public.memberships        WHERE tenant_id = $1`, [tenantId])
    })

    return schemaName
  })

  if (result === null) {
    throw new Error(`Advisory lock for tenant ${tenantId} is already held`)
  }

  logger.info({ tenantId, schemaName: result }, 'Tenant schema provisioned successfully')
}
