import { injectable, inject }   from 'inversify'
import {
  withAdmin,
  withTenant,
  ConflictError,
  ForbiddenError,
  type Tenant,
  type Membership,
  type SubscriptionWithPlan,
  type ResolvedFlag,
  type MemberRole,
  type SessionData,
} from '@saas/db'
import type pino from 'pino'
import { TOKENS } from '../container/tokens.js'
import type { RequestContext } from '../types.js'
import { buildPermissions } from '../lib/permissions.js'
import { auditMeta } from '../lib/audit-helpers.js'

const FEATURE_FLAG_KEYS = [
  'sso', 'custom_domain', 'api_access', 'webhooks',
  'advanced_analytics', 'audit_log', 'priority_support', 'schema_isolation',
] as const

export type FeatureFlagKey = typeof FEATURE_FLAG_KEYS[number]


export interface WorkspaceContext {
  tenant:      Tenant
  subscription: SubscriptionWithPlan | null
  membership:  Membership
  memberCount: number
  flags:       Record<FeatureFlagKey, ResolvedFlag>
}

export interface WorkspaceListItem {
  tenantId:   string
  tenantName: string
  tenantSlug: string
  role:       MemberRole
  joinedAt:   Date
}

export interface WorkspaceToken {
  role:      MemberRole
  planId:    string | null
  planSlug:  string | null
  sessionData: SessionData
}


@injectable()
export class TenantService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}

  async create(
    userId: string,
    data:   { name: string; slug?: string | undefined },
  ): Promise<{ tenant: Tenant; membership: Membership }> {
    const slug = data.slug ?? slugify(data.name)

    return withAdmin(async ({ repos }) => {
      const existing = await repos.tenants.findBySlug(slug)
      if (existing) throw new ConflictError(`Workspace slug '${slug}' is already taken`)

      const tenant = await repos.tenants.create({ name: data.name, slug, status: 'trialing' })

      const membership = await repos.memberships.create({
        tenantId: tenant.id,
        userId,
        role:     'owner',
        status:   'active',
      })

      // Starter plan: 14-day trial
      const starterPlan = await repos.plans.findBySlug('starter')
      if (!starterPlan) throw new Error('Starter plan missing — run seed migration')

      await repos.subscriptions.create({
        tenantId:     tenant.id,
        planId:       starterPlan.id,
        status:       'trialing',
        trialEndsAt:  new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000),
      })

      await repos.auditLogs.create({
        tenantId:     tenant.id,
        userId,
        action:       'tenants.create',
        resourceType: 'Tenant',
        resourceId:   tenant.id,
        after:        { name: tenant.name, slug: tenant.slug },
      })

      this.logger.info({ tenantId: tenant.id, userId }, 'Workspace created')
      return { tenant, membership }
    })
  }

  async getContext(ctx: RequestContext): Promise<WorkspaceContext> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const planId = ctx.planId || null

      const [tenant, subscription, membership, memberCount, flags] = await Promise.all([
        repos.tenants.findByIdOrThrow(ctx.tenantId!),
        repos.subscriptions.findByTenantId(ctx.tenantId!),
        repos.memberships.findByUserIdOrThrow(ctx.userId),
        repos.memberships.countActive(),
        repos.featureFlags.resolveMany([...FEATURE_FLAG_KEYS], ctx.tenantId!, planId),
      ])

      return {
        tenant,
        subscription,
        membership,
        memberCount,
        flags: flags as Record<FeatureFlagKey, ResolvedFlag>,
      }
    })
  }

  async listForUser(userId: string): Promise<WorkspaceListItem[]> {
    return withAdmin(async ({ repos }) => {
      const rows = await repos.memberships.findTenantsForUser(userId)
      return rows.map(r => ({
        tenantId:   r.tenantId,
        tenantName: (r as unknown as { tenant: { name: string } }).tenant.name,
        tenantSlug: (r as unknown as { tenant: { slug: string } }).tenant.slug,
        role:       r.role,
        joinedAt:   r.joinedAt,
      }))
    })
  }

  async selectWorkspace(userId: string, tenantId: string): Promise<WorkspaceToken> {
    return withAdmin(async ({ repos }) => {
      const memberships = await repos.memberships.findTenantsForUser(userId)
      const match = memberships.find(m => m.tenantId === tenantId)
      if (!match) throw new ForbiddenError('You are not a member of this workspace')

      if (match.status !== 'active') {
        throw new ForbiddenError('Your membership in this workspace is suspended')
      }

      const subscription = await repos.subscriptions.findByTenantId(tenantId)
      const planId   = subscription?.planId ?? null
      const planSlug = subscription?.plan?.slug ?? null

      const sessionData: SessionData = {
        role:        match.role,
        planId:      planId    ?? '',
        planSlug:    planSlug  ?? '',
        permissions: buildPermissions(match.role),
      }

      return { role: match.role, planId, planSlug, sessionData }
    })
  }

  async update(
    ctx:   RequestContext,
    patch: { name?: string; settings?: Record<string, unknown> },
  ): Promise<Tenant> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const before = await repos.tenants.findByIdOrThrow(ctx.tenantId!)
      const updated = await repos.tenants.update(ctx.tenantId!, patch)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'tenants.update',
        resourceType: 'Tenant',
        resourceId:   ctx.tenantId!,
        before:       { name: before.name, settings: before.settings },
        after:        { name: updated.name, settings: updated.settings },
        metadata:     auditMeta(ctx),
      })

      return updated
    })
  }

  async softDelete(ctx: RequestContext): Promise<void> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      // Audit before deletion — after deletion RLS would block the read
      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'tenants.delete',
        resourceType: 'Tenant',
        resourceId:   ctx.tenantId!,
        metadata:     auditMeta(ctx),
      })
      await repos.tenants.softDelete(ctx.tenantId!)
    })

    this.logger.warn({ tenantId: ctx.tenantId, userId: ctx.userId }, 'Workspace soft-deleted')
  }
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
