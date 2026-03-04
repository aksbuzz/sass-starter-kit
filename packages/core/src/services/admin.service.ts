import { injectable, inject } from 'inversify'
import {
  withAdmin,
  type Sql,
  type Tenant,
  type FeatureFlag,
  type TenantAdminRow,
  type UserAdminRow,
} from '@saas/db'
import type pino from 'pino'
import { TOKENS }    from '../container/tokens.js'

// Re-export repo types under the names the route layer expects
export type AdminTenantRow = TenantAdminRow
export type AdminUserRow   = UserAdminRow

export interface AdminTenantDetail extends TenantAdminRow {
  subscription: { planId: string; planSlug: string; status: string } | null
}

export interface AdminStats {
  tenantCount:         number
  userCount:           number
  activeSubscriptions: number
}

export interface CreateTenantData {
  name:        string
  slug?:       string
  ownerEmail?: string
  planId?:     string
}

export type PlatformFlag = Pick<FeatureFlag, 'key' | 'enabled' | 'config' | 'scopeType' | 'updatedAt'>


@injectable()
export class AdminService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}


  async listTenants(opts: {
    limit:   number
    offset:  number
    status?: string
    search?: string
  }): Promise<{ tenants: AdminTenantRow[]; total: number }> {
    return withAdmin(async ({ repos }) => {
      return repos.tenants.listForAdmin(opts)
    })
  }


  async createTenant(data: CreateTenantData): Promise<{ tenant: Tenant; invitationToken: string | null }> {
    return withAdmin(async ({ tx, repos }) => {
      const slug = data.slug ?? data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

      const tenant = await repos.tenants.create({ name: data.name, slug, status: 'trialing' })

      let invitationToken: string | null = null
      if (data.ownerEmail) {
        const rows = await (tx as unknown as Sql)<{ id: string; token: string }[]>`
          INSERT INTO invitations (tenant_id, email, role, token, invited_by, expires_at)
          VALUES (
            ${tenant.id}::uuid,
            ${data.ownerEmail},
            'owner',
            gen_random_uuid()::text,
            (SELECT id FROM users WHERE is_platform_admin = true ORDER BY created_at LIMIT 1),
            NOW() + INTERVAL '7 days'
          )
          RETURNING id, token
        `
        const row = rows[0]
        if (row) {
          invitationToken = row.token
          await repos.jobs.enqueue({
            type:    'invitation.send',
            payload: { type: 'invitation.send', invitationId: row.id },
          })
        }

        this.logger.info({ tenantId: tenant.id, ownerEmail: data.ownerEmail }, 'Owner invitation created')
      }

      this.logger.info({ tenantId: tenant.id, slug: tenant.slug }, 'Tenant created by platform admin')
      return { tenant, invitationToken }
    })
  }


  async getTenant(id: string): Promise<AdminTenantDetail> {
    return withAdmin(async ({ repos }) => {
      const tenant = await repos.tenants.findByIdOrThrow(id)
      const memberCount = await repos.memberships.countForTenant(id)
      const sub = await repos.subscriptions.findByTenantId(id)

      return {
        tenant,
        memberCount,
        planSlug: sub?.plan?.slug ?? null,
        subscription: sub
          ? { planId: sub.planId, planSlug: sub.plan.slug, status: sub.status }
          : null,
      }
    })
  }


  async updateTenant(
    id:    string,
    patch: { name?: string; status?: Tenant['status'] },
  ): Promise<Tenant> {
    return withAdmin(async ({ repos }) => {
      const tenant = await repos.tenants.update(id, patch)
      this.logger.info({ tenantId: id, patch }, 'Tenant updated by platform admin')
      return tenant
    })
  }


  async deleteTenant(id: string): Promise<void> {
    return withAdmin(async ({ repos }) => {
      await repos.tenants.softDelete(id)
      this.logger.info({ tenantId: id }, 'Tenant soft-deleted by platform admin')
    })
  }


  async listUsers(opts: {
    limit:   number
    offset:  number
    search?: string
  }): Promise<{ users: AdminUserRow[]; total: number }> {
    return withAdmin(async ({ repos }) => {
      return repos.users.listForAdmin(opts)
    })
  }


  async getStats(): Promise<AdminStats> {
    return withAdmin(async ({ tx }) => {
      // postgres.camel transforms column aliases: tenant_count → tenantCount
      type Row = { tenantCount: string; userCount: string; activeSubscriptions: string }
      const rows = await (tx as unknown as Sql)<Row[]>`
        SELECT
          (SELECT COUNT(*) FROM tenants       WHERE deleted_at IS NULL)::text  AS tenant_count,
          (SELECT COUNT(*) FROM users         WHERE deleted_at IS NULL)::text  AS user_count,
          (SELECT COUNT(*) FROM subscriptions WHERE status = 'active')::text   AS active_subscriptions
      `
      const r = rows[0]!
      return {
        tenantCount:         parseInt(r.tenantCount, 10),
        userCount:           parseInt(r.userCount, 10),
        activeSubscriptions: parseInt(r.activeSubscriptions, 10),
      }
    })
  }


  async listPlatformFlags(): Promise<PlatformFlag[]> {
    return withAdmin(async ({ repos }) => {
      const flags = await repos.featureFlags.listGlobal()
      return flags.map(f => ({
        key:       f.key,
        enabled:   f.enabled,
        config:    f.config,
        scopeType: f.scopeType,
        updatedAt: f.updatedAt,
      }))
    })
  }


  async upsertPlatformFlag(
    key:     string,
    enabled: boolean,
    config:  Record<string, unknown> = {},
  ): Promise<PlatformFlag> {
    return withAdmin(async ({ repos }) => {
      const flag = await repos.featureFlags.upsertGlobal(key, enabled, config)
      return {
        key:       flag.key,
        enabled:   flag.enabled,
        config:    flag.config,
        scopeType: flag.scopeType,
        updatedAt: flag.updatedAt,
      }
    })
  }


  async deletePlatformFlag(key: string): Promise<void> {
    return withAdmin(async ({ repos }) => {
      await repos.featureFlags.deleteGlobal(key)
    })
  }
}
