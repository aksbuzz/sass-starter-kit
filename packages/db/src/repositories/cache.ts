import type { Sql } from 'postgres'

export interface CacheSetOptions {
  tags?: string[]
  ttlSeconds?: number
}

export class CacheRepository {
  constructor(private readonly sql: Sql) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const rows = await this.sql<[{ value: T }?]>`
      SELECT value FROM cache
      WHERE  key = ${key}
        AND (expires_at IS NULL OR expires_at > NOW())
    `
    return rows[0]?.value ?? null
  }

  async set(key: string, value: unknown, opts: CacheSetOptions = {}): Promise<void> {
    const expiresAt = opts.ttlSeconds
      ? new Date(Date.now() + opts.ttlSeconds * 1000)
      : null

    await this.sql`
      INSERT INTO cache (key, value, tags, expires_at)
      VALUES (
        ${key},
        ${this.sql.json(value as unknown as Parameters<(typeof this.sql)['json']>[0])},
        ${opts.tags ?? []},
        ${expiresAt}
      )
      ON CONFLICT (key) DO UPDATE
        SET value      = EXCLUDED.value,
            tags       = EXCLUDED.tags,
            expires_at = EXCLUDED.expires_at,
            created_at = NOW()
    `
  }

  async del(key: string): Promise<void> {
    await this.sql`DELETE FROM cache WHERE key = ${key}`
  }

  async getAndDelete<T = unknown>(key: string): Promise<T | null> {
    const rows = await this.sql<[{ value: T }?]>`
      DELETE FROM cache
      WHERE  key = ${key}
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING value
    `
    return rows[0]?.value ?? null
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    if (tags.length === 0) return 0
    const result = await this.sql`
      DELETE FROM cache WHERE tags && ${tags}
    `
    return result.count
  }
}
