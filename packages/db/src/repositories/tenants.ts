import type { Sql } from 'postgres'
import type { Tenant, NewTenant, PatchTenant } from '../types.js'
import { NotFoundError, ConflictError } from '../errors.js'

export interface TenantAdminRow {
  tenant:      Tenant
  memberCount: number
  planSlug:    string | null
}

export class TenantsRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<Tenant | null> {
    const rows = await this.sql<Tenant[]>`
      SELECT * FROM tenants
      WHERE  id = ${id} AND deleted_at IS NULL
    `
    return rows[0] ?? null
  }

  async findByIdOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.findById(id)
    if (!tenant) throw new NotFoundError('Tenant', id)
    return tenant
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const rows = await this.sql<Tenant[]>`
      SELECT * FROM tenants
      WHERE  slug = ${slug} AND deleted_at IS NULL
    `
    return rows[0] ?? null
  }

  async create(data: NewTenant): Promise<Tenant> {
    try {
      const rows = await this.sql<Tenant[]>`
        INSERT INTO tenants (slug, name, status, isolation_mode)
        VALUES (
          ${data.slug},
          ${data.name},
          ${data.status ?? 'trialing'},
          ${data.isolationMode ?? 'rls'}
        )
        RETURNING *
      `
      return rows[0]!
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`Workspace slug '${data.slug}' is already taken`)
      }
      throw err
    }
  }

  async update(id: string, patch: PatchTenant): Promise<Tenant> {
    const rows = await this.sql<Tenant[]>`
      UPDATE tenants
         SET ${this.sql(patch as any)}
       WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('Tenant', id)
    return rows[0]
  }

  async softDelete(id: string): Promise<void> {
    await this.sql`
      UPDATE tenants
         SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
       WHERE id = ${id} AND deleted_at IS NULL
    `
  }

  async listAll(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<Tenant[]> {
    return this.sql<Tenant[]>`
      SELECT * FROM tenants
      WHERE  deleted_at IS NULL
        AND  ${opts.status ? this.sql`status = ${opts.status}` : this.sql`TRUE`}
      ORDER BY created_at DESC
      LIMIT  ${opts.limit  ?? 50}
      OFFSET ${opts.offset ?? 0}
    `
  }

  async listForAdmin(opts: {
    limit:   number
    offset:  number
    status?: string
    search?: string
  }): Promise<{ tenants: TenantAdminRow[]; total: number }> {
    // postgres.camel transforms all column names to camelCase
    type Row = {
      id: string; slug: string; name: string; status: string; isolationMode: string
      schemaName: string | null; settings: Record<string, unknown>; metadata: Record<string, unknown>
      createdAt: Date; updatedAt: Date; deletedAt: Date | null
      memberCount: string; planSlug: string | null; total: string
    }

    const rows = await this.sql<Row[]>`
      SELECT
        t.*,
        COUNT(DISTINCT m.id)::text          AS member_count,
        p.slug                              AS plan_slug,
        COUNT(*) OVER ()::text              AS total
      FROM   tenants t
      LEFT   JOIN memberships   m ON m.tenant_id = t.id
      LEFT   JOIN subscriptions s ON s.tenant_id = t.id
      LEFT   JOIN plans         p ON p.id = s.plan_id
      WHERE  t.deleted_at IS NULL
        AND  ${opts.status ? this.sql`t.status = ${opts.status}` : this.sql`TRUE`}
        AND  ${opts.search
          ? this.sql`(t.name ILIKE ${'%' + opts.search + '%'} OR t.slug ILIKE ${'%' + opts.search + '%'})`
          : this.sql`TRUE`}
      GROUP  BY t.id, p.slug
      ORDER  BY t.created_at DESC
      LIMIT  ${opts.limit}
      OFFSET ${opts.offset}
    `

    const total = rows[0] ? parseInt(rows[0].total, 10) : 0
    const tenants: TenantAdminRow[] = rows.map((r: Row) => ({
      tenant: {
        id:            r.id,
        slug:          r.slug,
        name:          r.name,
        status:        r.status as Tenant['status'],
        isolationMode: r.isolationMode as Tenant['isolationMode'],
        schemaName:    r.schemaName,
        settings:      r.settings,
        metadata:      r.metadata,
        createdAt:     r.createdAt,
        updatedAt:     r.updatedAt,
        deletedAt:     r.deletedAt,
      },
      memberCount: parseInt(r.memberCount, 10),
      planSlug:    r.planSlug,
    }))

    return { tenants, total }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}
