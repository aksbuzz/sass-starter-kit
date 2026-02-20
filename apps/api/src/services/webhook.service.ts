import { injectable, inject }   from 'inversify'
import { createHmac }            from 'node:crypto'
import {
  withAdmin,
  withTenant,
  ForbiddenError,
  NotFoundError,
  PlanLimitError,
  type WebhookEndpoint,
  type WebhookDelivery,
  type PlanLimits,
} from '@saas/db'
import type pino                 from 'pino'
import { TOKENS }                from '../container/tokens.js'
import type { RequestContext }   from '../types.js'
import { auditMeta }            from '../lib/audit-helpers.js'

// ---------------------------------------------------------------------------
//   1. CRUD for tenant-managed outbound endpoints (route handlers call these).
//   2. WebhookDispatcher.deliver() — called by the job worker to fire a single
//      HTTP delivery attempt and log the result.
// ---------------------------------------------------------------------------

@injectable()
export class WebhookService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}

  async listEndpoints(ctx: RequestContext): Promise<Omit<WebhookEndpoint, 'secret'>[]> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      ({ repos }) => repos.webhooks.findAll(),
    )
  }

  async createEndpoint(
    ctx:  RequestContext,
    data: { url: string; events: string[] },
  ): Promise<WebhookEndpoint> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    this.validateWebhookUrl(data.url)

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const subscription  = await repos.subscriptions.findByTenantId(ctx.tenantId!)
      const maxWebhooks   = (subscription?.plan?.limits as PlanLimits | undefined)?.maxWebhooks ?? 3
      const existing      = await repos.webhooks.findAll()

      if (existing.length >= maxWebhooks) {
        throw new PlanLimitError('webhooks', existing.length, maxWebhooks)
      }

      const endpoint = await repos.webhooks.create({
        tenantId: ctx.tenantId!,
        url:      data.url,
        events:   data.events,
      })

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'webhooks.create',
        resourceType: 'WebhookEndpoint',
        resourceId:   endpoint.id,
        after:        { url: data.url, events: data.events },
        metadata:     auditMeta(ctx),
      })

      this.logger.info({ tenantId: ctx.tenantId, endpointId: endpoint.id }, 'Webhook endpoint created')

      return endpoint
    })
  }

  async updateEndpoint(
    ctx:  RequestContext,
    id:   string,
    patch: { url?: string; events?: string[]; isActive?: boolean },
  ): Promise<Omit<WebhookEndpoint, 'secret'>> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    if (patch.url !== undefined) this.validateWebhookUrl(patch.url)

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const before   = await repos.webhooks.findById(id)
      if (!before) throw new NotFoundError('WebhookEndpoint', id)

      const updated  = await repos.webhooks.update(id, patch)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'webhooks.update',
        resourceType: 'WebhookEndpoint',
        resourceId:   id,
        before:       { url: before.url, events: before.events, isActive: before.isActive },
        after:        { url: updated.url, events: updated.events, isActive: updated.isActive },
        metadata:     auditMeta(ctx),
      })

      const { secret: _secret, ...rest } = updated
      return rest
    })
  }

  async deleteEndpoint(ctx: RequestContext, id: string): Promise<void> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const endpoint = await repos.webhooks.findById(id)
      if (!endpoint) throw new NotFoundError('WebhookEndpoint', id)

      await repos.webhooks.delete(id)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'webhooks.delete',
        resourceType: 'WebhookEndpoint',
        resourceId:   id,
        before:       { url: endpoint.url, events: endpoint.events },
        metadata:     auditMeta(ctx),
      })
    })
  }

  async listDeliveries(
    ctx:        RequestContext,
    endpointId: string,
    limit?:     number,
  ): Promise<WebhookDelivery[]> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const endpoint = await repos.webhooks.findById(endpointId)
      if (!endpoint) throw new NotFoundError('WebhookEndpoint', endpointId)

      return repos.webhooks.listDeliveries(endpointId, limit)
    })
  }

  // Called by the job worker for each 'webhook.deliver' job.
  // Fires a single HTTP POST to the endpoint URL, signs the payload with HMAC-SHA256,
  // and logs the result. Retry backoff is managed by pg_cron (see migrations).

  async deliver(data: {
    endpointId: string
    jobId?:     string | null
    eventType:  string
    payload:    Record<string, unknown>
    attempt?:   number
  }): Promise<void> {
    const endpoint = await withAdmin(({ repos }) => repos.webhooks.findByIdWithSecret(data.endpointId))

    if (!endpoint) {
      this.logger.warn({ endpointId: data.endpointId }, 'Webhook deliver: endpoint not found')
      return
    }

    if (!endpoint.isActive) {
      this.logger.debug({ endpointId: data.endpointId }, 'Webhook deliver: endpoint inactive — skipping')
      return
    }

    const body      = JSON.stringify({ event: data.eventType, ...data.payload })
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = this.sign(endpoint.secret, timestamp, body)

    const startedAt = Date.now()
    let statusCode: number | null   = null
    let responseBody: string | null = null
    let deliveredAt: Date | null    = null

    try {
      const response = await fetch(endpoint.url, {
        method:  'POST',
        headers: {
          'Content-Type':        'application/json',
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event':     data.eventType,
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10-second timeout per delivery attempt
      })

      statusCode   = response.status
      responseBody = (await response.text()).slice(0, 1024) // cap stored response
      deliveredAt  = response.ok ? new Date() : null

      if (!response.ok) {
        this.logger.warn({
          endpointId: data.endpointId,
          statusCode,
          attempt: data.attempt,
        }, 'Webhook delivery: non-2xx response')
      }
    } catch (err) {
      this.logger.error({ endpointId: data.endpointId, err }, 'Webhook delivery: network error')
      responseBody = err instanceof Error ? err.message : 'Network error'
    }

    const durationMs = Date.now() - startedAt

    await withAdmin(({ repos }) => repos.webhooks.logDelivery({
      endpointId:   data.endpointId,
      jobId:        data.jobId ?? null,
      eventType:    data.eventType,
      payload:      data.payload,
      statusCode,
      responseBody,
      durationMs,
      attempt:      data.attempt ?? 1,
      deliveredAt,
    }))

    if (statusCode === null || statusCode < 200 || statusCode >= 300) {
      throw new Error(`Webhook delivery did not succeed: HTTP ${statusCode ?? 'network error'}`)
    }
  }

  private sign(secret: string, timestamp: string, body: string): string {
    return createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')
  }

  // SSRF guard: block non-http/https schemes and private/internal IP ranges.
  private validateWebhookUrl(url: string): void {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw Object.assign(new Error('Invalid webhook URL'), { statusCode: 400 })
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw Object.assign(
        new Error('Webhook URL must use http or https'),
        { statusCode: 400 },
      )
    }

    // Strip IPv6 brackets for regex matching
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')

    const PRIVATE_PATTERNS = [
      /^localhost$/,
      /^127\./,
      /^0\.0\.0\.0$/,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^169\.254\./, // link-local (includes cloud metadata at 169.254.169.254)
      /^::1$/,       // IPv6 loopback
      /^fc[0-9a-f]{2}:/,  // IPv6 unique local fc00::/7
      /^fd[0-9a-f]{2}:/,  // IPv6 unique local fd00::/7
      /^fe80:/,           // IPv6 link-local
    ]

    if (PRIVATE_PATTERNS.some(re => re.test(hostname))) {
      throw Object.assign(
        new Error('Webhook URL must not point to a private or reserved address'),
        { statusCode: 400 },
      )
    }
  }
}
