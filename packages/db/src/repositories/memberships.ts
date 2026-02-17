import type { Sql } from 'postgres'
import type { Membership, MembershipWithUser, NewMembership, MemberRole } from '../types.js'
import { NotFoundError, ConflictError } from '../errors.js'

export class MembershipsRepository {
  constructor(private readonly sql: Sql) {}

  async findByUserId(userId: string): Promise<Membership | null> {
    const rows = await this.sql<Membership[]>`
      SELECT * FROM memberships
      WHERE  user_id = ${userId} AND status = 'active'
    `
    return rows[0] ?? null
  }

  async findByUserIdOrThrow(userId: string): Promise<Membership> {
    const m = await this.findByUserId(userId)
    if (!m) throw new NotFoundError('Membership', userId)
    return m
  }

  async findById(id: string): Promise<Membership | null> {
    const rows = await this.sql<Membership[]>`
      SELECT * FROM memberships WHERE id = ${id}
    `
    return rows[0] ?? null
  }

  async findAll(opts: { role?: MemberRole; limit?: number; offset?: number } = {}): Promise<MembershipWithUser[]> {
    return this.sql<MembershipWithUser[]>`
      SELECT
        m.*,
        json_build_object(
          'id',        u.id,
          'email',     u.email,
          'name',      u.name,
          'avatarUrl', u.avatar_url
        ) AS user
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.status = 'active'
        AND u.deleted_at IS NULL
        AND ${opts.role ? this.sql`m.role = ${opts.role}` : this.sql`TRUE`}
      ORDER BY m.joined_at ASC
      LIMIT  ${opts.limit  ?? 50}
      OFFSET ${opts.offset ?? 0}
    `
  }

  async countActive(): Promise<number> {
    const [row] = await this.sql<[{ count: string }]>`
      SELECT COUNT(*) AS count FROM memberships WHERE status = 'active'
    `
    return parseInt(row!.count, 10)
  }

  async countByRole(role: MemberRole): Promise<number> {
    const [row] = await this.sql<[{ count: string }]>`
      SELECT COUNT(*) AS count FROM memberships
      WHERE  status = 'active' AND role = ${role}
    `
    return parseInt(row!.count, 10)
  }

  async countByRoleForUpdate(role: MemberRole): Promise<number> {
    const [row] = await this.sql<[{ count: string }]>`
      SELECT COUNT(*) AS count FROM (
        SELECT 1 FROM memberships
        WHERE  status = 'active' AND role = ${role}
        FOR UPDATE
      ) locked
    `
    return parseInt(row!.count, 10)
  }

  async create(data: NewMembership): Promise<Membership> {
    try {
      const rows = await this.sql<Membership[]>`
        INSERT INTO memberships (tenant_id, user_id, role, status, joined_at)
        VALUES (
          ${data.tenantId},
          ${data.userId},
          ${data.role ?? 'member'},
          ${data.status ?? 'active'},
          ${data.joinedAt ?? new Date()}
        )
        RETURNING *
      `
      return rows[0]!
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`User ${data.userId} is already a member of this tenant`)
      }
      throw err
    }
  }

  async updateRole(id: string, role: MemberRole): Promise<Membership> {
    const rows = await this.sql<Membership[]>`
      UPDATE memberships
         SET role = ${role}, updated_at = NOW()
       WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('Membership', id)
    return rows[0]
  }

  async suspend(id: string): Promise<Membership> {
    const rows = await this.sql<Membership[]>`
      UPDATE memberships
         SET status = 'suspended', updated_at = NOW()
       WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('Membership', id)
    return rows[0]
  }

  async activate(id: string): Promise<Membership> {
    const rows = await this.sql<Membership[]>`
      UPDATE memberships
         SET status = 'active', updated_at = NOW()
       WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('Membership', id)
    return rows[0]
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM memberships WHERE id = ${id}`
  }

  async findTenantsForUser(userId: string): Promise<Array<Membership & { tenant: { id: string; name: string; slug: string } }>> {
    return this.sql`
      SELECT
        m.*,
        json_build_object(
          'id',   t.id,
          'name', t.name,
          'slug', t.slug
        ) AS tenant
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = ${userId}
        AND m.status  = 'active'
        AND t.deleted_at IS NULL
      ORDER BY m.joined_at ASC
    `
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}
