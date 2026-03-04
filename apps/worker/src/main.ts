import './container.js'

import { createServer } from 'node:http'
import pino                          from 'pino'
import { sql, adminSql }             from '@saas/db'
import {
  config,
  metricsRegistry as registry,
  initDbMetrics,
  JobWorker,
} from '@saas/core'
import { handleInvitationSend }      from './handlers/invitation.js'
import { handleWebhookDeliver }      from './handlers/webhook-deliver.js'
import {
  handleStripeSyncSubscription,
  handleStripeSyncCustomer,
} from './handlers/stripe-sync.js'
import { handleTenantProvisionSchema } from './handlers/provision-schema.js'
import { handleEmailSend }             from './handlers/email.js'
import { handleArchiveAuditLogs }      from './handlers/archive-audit-logs.js'

// ---------------------------------------------------------------------------
// Queues:
//   email   — invitation emails, transactional messages
//   webhook — outbound HTTP delivery to tenant-registered endpoints
//   stripe  — Stripe subscription/customer reconciliation
//   default — fallback for any job without an explicit queue
// ---------------------------------------------------------------------------

const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
}).child({ process: 'worker' })

initDbMetrics(logger)

const emailWorker = new JobWorker({
  queue:    'email',
  logger,
  handlers: {
    'invitation.send': handleInvitationSend,
    'email.send':      handleEmailSend,
  },
})

const webhookWorker = new JobWorker({
  queue:       'webhook',
  logger,
  concurrency: 10,  // webhook delivery is I/O-bound — higher concurrency is fine
  pollMs:      2_000,
  handlers: {
    'webhook.deliver': handleWebhookDeliver,
  },
})

const stripeWorker = new JobWorker({
  queue:    'stripe',
  logger,
  handlers: {
    'stripe.sync-subscription': handleStripeSyncSubscription,
    'stripe.sync-customer':     handleStripeSyncCustomer,
  },
})

const defaultWorker = new JobWorker({
  queue:    'default',
  logger,
  handlers: {
    'invitation.send':           handleInvitationSend,
    'webhook.deliver':           handleWebhookDeliver,
    'stripe.sync-subscription':  handleStripeSyncSubscription,
    'stripe.sync-customer':      handleStripeSyncCustomer,
    'tenant.provision-schema':    handleTenantProvisionSchema,
    'tenant.archive-audit-logs':  handleArchiveAuditLogs,
    'email.send':                 handleEmailSend,
  },
})


const workers = [emailWorker, webhookWorker, stripeWorker, defaultWorker]
workers.forEach(w => w.start())

logger.info(`Worker process started — polling ${workers.length} queues`)

// ── Metrics HTTP server ─────────────────────────────────────────────
const metricsPort = Number(process.env['WORKER_METRICS_PORT'] ?? 9091)
const metricsServer = createServer(async (req, res) => {
  if (req.url === '/metrics') {
    const metrics = await registry.metrics()
    res.writeHead(200, { 'Content-Type': registry.contentType })
    res.end(metrics)
  } else {
    res.writeHead(404)
    res.end()
  }
})
metricsServer.listen(metricsPort, () => {
  logger.info({ port: metricsPort }, 'Worker metrics server listening')
})

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down worker...')

  // Stop polling — in-flight jobs will finish before the process exits
  await Promise.all(workers.map(w => w.stop()))
  metricsServer.close()

  await Promise.all([sql.end(), adminSql.end()])

  logger.info('Worker shutdown complete')
  // Let the event loop drain naturally; force-exit after 5s if something lingers
  setTimeout(() => process.exit(1), 5_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT',  () => void shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — exiting')
  process.exit(1)
})
