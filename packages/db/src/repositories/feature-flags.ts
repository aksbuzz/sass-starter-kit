import type { Sql } from 'postgres'
import type { FeatureFlag, ResolvedFlag } from '../types.js'

export class FeatureFlagsRepository {
  constructor(private readonly sql: Sql) {}

  // Resolution order: tenant override → plan default → global default.
  async resolve(key: string, tenantId: string, planId: string): Promise<ResolvedFlag> {
    const rows = await this.sql<ResolvedFlag[]>`
      SELECT key, enabled, config
      FROM   feature_flags
      WHERE  key = ${key}
        AND (
              (scope_type = 'tenant' AND scope_id = ${tenantId}::uuid)
           OR (scope_type = 'plan'   AND scope_id = ${planId}::uuid)
           OR  scope_type = 'global'
            )
      ORDER BY CASE scope_type
        WHEN 'tenant' THEN 1
        WHEN 'plan'   THEN 2
        ELSE               3
      END
      LIMIT 1
    `
    return rows[0] ?? { key, enabled: false, config: {} }
  }


  async resolveMany(
    keys: string[],
    tenantId: string,
    planId: string,
  ): Promise<Record<string, ResolvedFlag>> {
    if (keys.length === 0) return {}

    const rows = await this.sql<ResolvedFlag[]>`
      SELECT DISTINCT ON (key) key, enabled, config
      FROM   feature_flags
      WHERE  key = ANY(${keys})
        AND (
              (scope_type = 'tenant' AND scope_id = ${tenantId}::uuid)
           OR (scope_type = 'plan'   AND scope_id = ${planId}::uuid)
           OR  scope_type = 'global'
            )
      ORDER BY key,
               CASE scope_type
                 WHEN 'tenant' THEN 1
                 WHEN 'plan'   THEN 2
                 ELSE               3
               END
    `
    const result: Record<string, ResolvedFlag> = {}
    for (const key of keys) {
      result[key] = { key, enabled: false, config: {} }
    }
    for (const row of rows) {
      result[row.key] = row
    }
    return result
  }

  async setTenantOverride(
    key: string,
    tenantId: string,
    enabled: boolean,
    config: Record<string, unknown> = {},
  ): Promise<FeatureFlag> {
    const rows = await this.sql<FeatureFlag[]>`
      INSERT INTO feature_flags (key, scope_type, scope_id, enabled, config)
      VALUES (${key}, 'tenant', ${tenantId}::uuid, ${enabled}, ${this.sql.json(config as unknown as Parameters<(typeof this.sql)['json']>[0])})
      ON CONFLICT (key, scope_id) WHERE scope_type <> 'global'
        DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config, updated_at = NOW()
      RETURNING *
    `
    return rows[0]!
  }

  async deleteTenantOverride(key: string, tenantId: string): Promise<void> {
    await this.sql`
      DELETE FROM feature_flags
      WHERE  key = ${key} AND scope_type = 'tenant' AND scope_id = ${tenantId}::uuid
    `
  }

  async listTenantOverrides(tenantId: string): Promise<FeatureFlag[]> {
    return this.sql<FeatureFlag[]>`
      SELECT * FROM feature_flags
      WHERE  scope_type = 'tenant' AND scope_id = ${tenantId}::uuid
      ORDER BY key
    `
  }
}
