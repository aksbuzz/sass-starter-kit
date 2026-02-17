import type { Sql } from 'postgres'
import type { Session, NewSession } from '../types.js'

export class SessionsRepository {
  constructor(private readonly sql: Sql) {}

  async create(data: NewSession): Promise<Session> {
    const rows = await this.sql<Session[]>`
      INSERT INTO sessions (user_id, tenant_id, data, ip_address, user_agent, expires_at)
      VALUES (
        ${data.userId},
        ${data.tenantId ?? null},
        ${this.sql.json(data.data ? data.data as unknown as Parameters<(typeof this.sql)['json']>[0] : {})},
        ${data.ipAddress ?? null},
        ${data.userAgent ?? null},
        ${data.expiresAt}
      )
      RETURNING *
    `
    return rows[0]!
  }

  async findValid(id: string): Promise<Session | null> {
    const rows = await this.sql<Session[]>`
      SELECT * FROM sessions
      WHERE  id = ${id} AND expires_at > NOW()
    `
    return rows[0] ?? null
  }

  async findValidForUpdate(id: string): Promise<Session | null> {
    const rows = await this.sql<Session[]>`
      SELECT * FROM sessions
      WHERE  id = ${id} AND expires_at > NOW()
      FOR UPDATE
    `
    return rows[0] ?? null
  }

  async deleteById(id: string): Promise<void> {
    await this.sql`DELETE FROM sessions WHERE id = ${id}`
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM sessions WHERE user_id = ${userId}
    `
    return result.count
  }

  // (called when a membership role changes; forces re-login to get fresh permissions snapshot)
  async deleteByUserAndTenant(userId: string, tenantId: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM sessions
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}
    `
    return result.count
  }

  async updateTenantContext(
    id:       string,
    tenantId: string,
    data:     Record<string, unknown>,
  ): Promise<void> {
    await this.sql`
      UPDATE sessions
      SET    tenant_id = ${tenantId},
             data      = ${this.sql.json(data as unknown as Parameters<(typeof this.sql)['json']>[0])}
      WHERE  id = ${id}
    `
  }
}
