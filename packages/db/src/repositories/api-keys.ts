import type { Sql } from 'postgres'
import { createHash, randomBytes } from 'node:crypto'
import type { ApiKey, CreatedApiKey } from '../types.js'
import { NotFoundError } from '../errors.js'

// Key format: sk_{env}_{40 random url-safe base64 chars}
const KEY_PREFIX_VISIBLE_CHARS = 12

function generateKey(env: 'live' | 'test' = 'live'): { fullKey: string; prefix: string; hash: string } {
  const random = randomBytes(30).toString('base64url')
  const fullKey = `sk_${env}_${random}`
  const prefix  = fullKey.slice(0, KEY_PREFIX_VISIBLE_CHARS)
  const hash    = createHash('sha256').update(fullKey).digest('hex')
  return { fullKey, prefix, hash }
}

export class ApiKeysRepository {
  constructor(private readonly sql: Sql) {}

  async create(data: {
    tenantId: string
    createdBy?: string | null
    name: string
    scopes?: string[]
    expiresAt?: Date | null
  }): Promise<CreatedApiKey> {
    const { fullKey, prefix, hash } = generateKey()

    const rows = await this.sql<ApiKey[]>`
      INSERT INTO api_keys (tenant_id, created_by, name, prefix, key_hash, scopes, expires_at)
      VALUES (
        ${data.tenantId},
        ${data.createdBy ?? null},
        ${data.name},
        ${prefix},
        ${hash},
        ${data.scopes ?? []},
        ${data.expiresAt ?? null}
      )
      RETURNING *
    `
    return { ...rows[0]!, fullKey }
  }

  async findByRawKey(rawKey: string): Promise<ApiKey | null> {
    const hash = createHash('sha256').update(rawKey).digest('hex')
    const rows = await this.sql<ApiKey[]>`
      SELECT * FROM api_keys
      WHERE  key_hash   = ${hash}
        AND  revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    `
    return rows[0] ?? null
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${id}`
  }

  async countActive(): Promise<number> {
    const rows = await this.sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM api_keys
      WHERE revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    `
    return parseInt(rows[0]!.count, 10)
  }

  async findById(id: string): Promise<Omit<ApiKey, 'keyHash'> | null> {
    const rows = await this.sql<Omit<ApiKey, 'keyHash'>[]>`
      SELECT id, tenant_id, created_by, name, prefix, scopes,
             last_used_at, expires_at, revoked_at, created_at
      FROM   api_keys
      WHERE  id = ${id}
    `
    return rows[0] ?? null
  }

  async findByTenantId(): Promise<Omit<ApiKey, 'keyHash'>[]> {
    return this.sql<Omit<ApiKey, 'keyHash'>[]>`
      SELECT id, tenant_id, created_by, name, prefix, scopes,
             last_used_at, expires_at, revoked_at, created_at
      FROM   api_keys
      ORDER BY created_at DESC
    `
  }

  async revoke(id: string): Promise<void> {
    const rows = await this.sql`
      UPDATE api_keys SET revoked_at = NOW() WHERE id = ${id} RETURNING id
    `
    if (rows.count === 0) throw new NotFoundError('ApiKey', id)
  }
}
