import { injectable, inject }   from 'inversify'
import {
  withTenant,
  ForbiddenError,
  NotFoundError,
  PlanLimitError,
  type ApiKey,
  type CreatedApiKey,
  type PlanLimits,
} from '@saas/db'
import type pino                 from 'pino'
import { TOKENS }                from '../container/tokens.js'
import type { RequestContext }   from '../types.js'
import { auditMeta }            from '../lib/audit-helpers.js'


@injectable()
export class ApiKeyService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}


  async list(ctx: RequestContext): Promise<Omit<ApiKey, 'keyHash'>[]> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, ({ repos }) =>
      repos.apiKeys.findByTenantId(),
    )
  }


  async create(
    ctx:  RequestContext,
    data: { name: string; scopes?: string[]; expiresAt?: Date | null },
  ): Promise<CreatedApiKey> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      // Enforce plan limit
      const subscription = await repos.subscriptions.findByTenantId(ctx.tenantId!)
      const maxApiKeys   = (subscription?.plan?.limits as PlanLimits | undefined)?.maxApiKeys ?? 10

      const current = await repos.apiKeys.countActive()
      if (current >= maxApiKeys) throw new PlanLimitError('api_keys', current, maxApiKeys)

      const apiKey = await repos.apiKeys.create({
        tenantId:  ctx.tenantId!,
        createdBy: ctx.userId,
        name:      data.name,
        scopes:    data.scopes ?? [],
        expiresAt: data.expiresAt ?? null,
      })

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'api_keys.create',
        resourceType: 'ApiKey',
        resourceId:   apiKey.id,
        after:        { name: data.name, prefix: apiKey.prefix, scopes: data.scopes ?? [] },
        metadata:     auditMeta(ctx),
      })

      this.logger.info({ tenantId: ctx.tenantId, keyId: apiKey.id }, 'API key created')
      return apiKey
    })
  }


  async revoke(ctx: RequestContext, keyId: string): Promise<void> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const key = await repos.apiKeys.findById(keyId)
      if (!key) throw new NotFoundError('ApiKey', keyId)

      await repos.apiKeys.revoke(keyId)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'api_keys.revoke',
        resourceType: 'ApiKey',
        resourceId:   keyId,
        before:       { name: key.name, prefix: key.prefix },
        metadata:     auditMeta(ctx),
      })

      this.logger.info({ tenantId: ctx.tenantId, keyId }, 'API key revoked')
    })
  }
}
