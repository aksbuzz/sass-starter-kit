import { container }    from '../../container/index.js'
import { TOKENS }        from '../../container/tokens.js'
import { WebhookService } from '../../services/webhook.service.js'
import type { JobHandler } from '../job-worker.js'
import type { JobPayload } from '@saas/db'

// ---------------------------------------------------------------------------
// Delegates to WebhookService.deliver() which handles:
//   • Fetching the endpoint (with admin connection)
//   • Signing the payload with HMAC-SHA256
//   • Sending the HTTP POST with a 10-second timeout
//   • Logging the delivery attempt to webhook_deliveries
// ---------------------------------------------------------------------------

const webhookSvc = container.get<WebhookService>(TOKENS.WebhookService)

export const handleWebhookDeliver: JobHandler<Extract<JobPayload, { type: 'webhook.deliver' }>> =
  async (job, logger) => {
    const { endpointId, eventType, payload } = job.payload

    await webhookSvc.deliver({
      endpointId,
      jobId:     job.id,
      eventType,
      payload,
      attempt:   job.attempts,
    })

    logger.debug({ endpointId, eventType }, 'Webhook delivery attempted')
  }
