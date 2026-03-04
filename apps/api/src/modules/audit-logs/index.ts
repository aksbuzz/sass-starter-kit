import type { ApiModule }       from '@saas/core'
import { registerAuditLogs }   from '@saas/core'
import { auditLogRoutes }      from './routes.js'

export const auditLogsModule: ApiModule = {
  name:      'audit-logs',
  container: registerAuditLogs,
  routes:    auditLogRoutes,
}
