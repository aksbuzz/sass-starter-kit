import type { Sql } from 'postgres'
import type { Tenant, NewTenant, PatchTenant } from '../types.js'
import { NotFoundError, ConflictError } from '../errors.js'

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
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}
