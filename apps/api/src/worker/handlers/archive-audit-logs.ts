import { withAdmin, adminSql } from '@saas/db'
import type { JobHandler }     from '../job-worker.js'
import type { JobPayload }     from '@saas/db'

// ---------------------------------------------------------------------------
// Deletes audit log entries for a specific tenant that are older than
// `beforeDate`. Intended to be enqueued by pg_cron on a retention schedule
// (e.g. monthly, after the previous month's partition has been exported).
// ---------------------------------------------------------------------------

type Payload = Extract<JobPayload, { type: 'tenant.archive-audit-logs' }>

export const handleArchiveAuditLogs: JobHandler<Payload> = async (job, logger) => {
  const { tenantId, beforeDate } = job.payload

  const cutoff = new Date(beforeDate)
  if (isNaN(cutoff.getTime())) {
    throw new Error(`Invalid beforeDate: ${beforeDate}`)
  }

  await withAdmin(async ({ repos }) => {
    await repos.tenants.findByIdOrThrow(tenantId)
  })

  const BATCH_SIZE = 10_000
  let totalDeleted = 0
  let batchSize: number

  do {
    const deleted = await adminSql`
      DELETE FROM audit_logs
      WHERE tenant_id = ${tenantId}
        AND created_at < ${cutoff}
        AND id IN (
          SELECT id FROM audit_logs
          WHERE tenant_id = ${tenantId}
            AND created_at < ${cutoff}
          LIMIT ${BATCH_SIZE}
        )
      RETURNING id
    `
    batchSize = deleted.length
    totalDeleted += batchSize
  } while (batchSize === BATCH_SIZE)

  logger.info(
    { tenantId, beforeDate, deletedCount: totalDeleted },
    'Audit logs archived',
  )
}
