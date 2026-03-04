import type { Container }    from 'inversify'
import { AuditLogService }   from '../services/audit-log.service.js'
import { TOKENS }            from '../container/tokens.js'

export function registerAuditLogs(container: Container): void {
  container.bind<AuditLogService>(TOKENS.AuditLogService).to(AuditLogService).inSingletonScope()
}
