import { injectable, inject }   from 'inversify'
import {
  withTenant,
  ForbiddenError,
  type AuditLog,
  type AuditLogFilter,
} from '@saas/db'
import type pino               from 'pino'
import { TOKENS }              from '../container/tokens.js'
import type { RequestContext } from '../types.js'


@injectable()
export class AuditLogService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}


  async list(
    ctx:    RequestContext,
    filter: AuditLogFilter = {},
  ): Promise<{ rows: AuditLog[]; total: number }> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    const result = await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, ({ repos }) =>
      repos.auditLogs.findForTenant(filter),
    )

    this.logger.debug(
      { tenantId: ctx.tenantId, total: result.total, filter },
      'Audit logs fetched',
    )

    return result
  }
}
