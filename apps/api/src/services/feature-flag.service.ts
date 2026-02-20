import { injectable, inject }   from 'inversify'
import {
  withTenant,
  ForbiddenError,
  type FeatureFlag,
  type ResolvedFlag,
} from '@saas/db'
import type pino               from 'pino'
import { TOKENS }              from '../container/tokens.js'
import type { RequestContext } from '../types.js'
import { auditMeta }          from '../lib/audit-helpers.js'


@injectable()
export class FeatureFlagService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}


  // Resolution order: tenant override → plan default → global default.
  async resolve(ctx: RequestContext, key: string): Promise<ResolvedFlag> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, ({ repos }) =>
      repos.featureFlags.resolve(key, ctx.tenantId!, ctx.planId ?? ''),
    )
  }


  async resolveMany(ctx: RequestContext, keys: string[]): Promise<Record<string, ResolvedFlag>> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, ({ repos }) =>
      repos.featureFlags.resolveMany(keys, ctx.tenantId!, ctx.planId ?? ''),
    )
  }


  async listOverrides(ctx: RequestContext): Promise<FeatureFlag[]> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, ({ repos }) =>
      repos.featureFlags.listTenantOverrides(ctx.tenantId!),
    )
  }


  async setOverride(
    ctx:     RequestContext,
    key:     string,
    enabled: boolean,
    config:  Record<string, unknown> = {},
  ): Promise<FeatureFlag> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const flag = await repos.featureFlags.setTenantOverride(key, ctx.tenantId!, enabled, config)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'feature_flags.set',
        resourceType: 'FeatureFlag',
        resourceId:   key,
        after:        { key, enabled, config },
        metadata:     auditMeta(ctx),
      })

      this.logger.info({ tenantId: ctx.tenantId, key, enabled }, 'Feature flag override set')
      return flag
    })
  }


  async deleteOverride(ctx: RequestContext, key: string): Promise<void> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      await repos.featureFlags.deleteTenantOverride(key, ctx.tenantId!)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'feature_flags.delete',
        resourceType: 'FeatureFlag',
        resourceId:   key,
        metadata:     auditMeta(ctx),
      })

      this.logger.info({ tenantId: ctx.tenantId, key }, 'Feature flag override deleted')
    })
  }
}
