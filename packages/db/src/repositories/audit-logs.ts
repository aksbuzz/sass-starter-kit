import type { Sql } from 'postgres'
import type { AuditLog } from '../types.js'

export interface AuditLogFilter {
  action?: string | undefined
  resourceType?: string | undefined 
  resourceId?: string | undefined
  userId?: string | undefined
  from?: Date | undefined
  to?: Date | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export class AuditLogsRepository {
  constructor(private readonly sql: Sql) {}

  async findForTenant(filter: AuditLogFilter = {}): Promise<{ rows: AuditLog[]; total: number }> {
    const {
      action, resourceType, resourceId, userId,
      from, to,
      limit = 50, offset = 0,
    } = filter

    const rows = await this.sql<AuditLog[]>`
      SELECT * FROM audit_logs
      WHERE TRUE
        AND ${action       ? this.sql`action        = ${action}`       : this.sql`TRUE`}
        AND ${resourceType ? this.sql`resource_type = ${resourceType}` : this.sql`TRUE`}
        AND ${resourceId   ? this.sql`resource_id   = ${resourceId}`   : this.sql`TRUE`}
        AND ${userId       ? this.sql`user_id       = ${userId}::uuid` : this.sql`TRUE`}
        AND ${from         ? this.sql`created_at   >= ${from}`         : this.sql`TRUE`}
        AND ${to           ? this.sql`created_at   <  ${to}`           : this.sql`TRUE`}
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    `

    const [countRow] = await this.sql<[{ total: string }]>`
      SELECT COUNT(*) AS total FROM audit_logs
      WHERE TRUE
        AND ${action       ? this.sql`action        = ${action}`       : this.sql`TRUE`}
        AND ${resourceType ? this.sql`resource_type = ${resourceType}` : this.sql`TRUE`}
        AND ${resourceId   ? this.sql`resource_id   = ${resourceId}`   : this.sql`TRUE`}
        AND ${userId       ? this.sql`user_id       = ${userId}::uuid` : this.sql`TRUE`}
        AND ${from         ? this.sql`created_at   >= ${from}`         : this.sql`TRUE`}
        AND ${to           ? this.sql`created_at   <  ${to}`           : this.sql`TRUE`}
    `

    return { rows, total: parseInt(countRow!.total, 10) }
  }

  async create(data: {
    tenantId: string
    userId?: string | null
    action: string
    resourceType: string
    resourceId?: string | null
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    metadata?: Record<string, unknown>
  }): Promise<AuditLog> {
    const rows = await this.sql<AuditLog[]>`
      INSERT INTO audit_logs (
        tenant_id, user_id, action, resource_type, resource_id,
        before, after, metadata
      ) VALUES (
        ${data.tenantId},
        ${data.userId ?? null},
        ${data.action},
        ${data.resourceType},
        ${data.resourceId ?? null},
        ${data.before ? this.sql.json(data.before as unknown as Parameters<(typeof this.sql)['json']>[0]) : null},
        ${data.after  ? this.sql.json(data.after as unknown as Parameters<(typeof this.sql)['json']>[0])  : null},
        ${this.sql.json((data.metadata ?? {}) as unknown as Parameters<(typeof this.sql)['json']>[0])}
      )
      RETURNING *
    `
    return rows[0]!
  }
}
