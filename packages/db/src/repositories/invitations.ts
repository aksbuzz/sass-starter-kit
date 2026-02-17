import type { Sql } from 'postgres'
import type { Invitation, NewInvitation } from '../types.js'
import { NotFoundError, ConflictError } from '../errors.js'

export class InvitationsRepository {
  constructor(private readonly sql: Sql) {}


  async findById(id: string): Promise<Invitation | null> {
    const rows = await this.sql<Invitation[]>`SELECT * FROM invitations WHERE id = ${id}`
    return rows[0] ?? null
  }


  async findByToken(token: string): Promise<Invitation | null> {
    const rows = await this.sql<Invitation[]>`
      SELECT * FROM invitations
      WHERE  token = ${token}
        AND  accepted_at IS NULL
        AND  expires_at > NOW()
    `
    return rows[0] ?? null
  }

  async findByTokenOrThrow(token: string): Promise<Invitation> {
    const inv = await this.findByToken(token)
    if (!inv) throw new NotFoundError('Invitation', token)
    return inv
  }


  async findPending(email: string): Promise<Invitation | null> {
    const rows = await this.sql<Invitation[]>`
      SELECT * FROM invitations
      WHERE  email = ${email.toLowerCase()}
        AND  accepted_at IS NULL
        AND  expires_at > NOW()
    `
    return rows[0] ?? null
  }


  async listPending(): Promise<Invitation[]> {
    return this.sql<Invitation[]>`
      SELECT * FROM invitations
      WHERE  accepted_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
    `
  }

  async create(data: NewInvitation): Promise<Invitation> {
    try {
      const rows = await this.sql<Invitation[]>`
        INSERT INTO invitations (tenant_id, email, role, invited_by, expires_at)
        VALUES (
          ${data.tenantId},
          ${data.email.toLowerCase()},
          ${data.role ?? 'member'},
          ${data.invitedBy},
          ${data.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)}
        )
        RETURNING *
      `
      return rows[0]!
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`An invitation for ${data.email} already exists`)
      }
      throw err
    }
  }


  async accept(id: string): Promise<Invitation> {
    const rows = await this.sql<Invitation[]>`
      UPDATE invitations
         SET accepted_at = NOW()
       WHERE id = ${id} AND accepted_at IS NULL
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('Invitation', id)
    return rows[0]
  }


  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM invitations WHERE id = ${id}`
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}
