import Stripe          from 'stripe'
import { container }   from '../../container/index.js'
import { TOKENS }      from '../../container/tokens.js'
import { BillingService } from '../../services/billing.service.js'
import type { JobHandler } from '../job-worker.js'
import type { JobPayload } from '@saas/db'

// ---------------------------------------------------------------------------
// Re-fetches the subscription from Stripe and syncs via BillingService.
// Use cases:
//   • Manual reconciliation after an admin action
//   • Recovering from a missed or failed webhook event
//   • Scheduled daily consistency check
// ---------------------------------------------------------------------------

const billingSvc = container.get<BillingService>(TOKENS.BillingService)

export const handleStripeSyncSubscription: JobHandler<
  Extract<JobPayload, { type: 'stripe.sync-subscription' }>
> = async (job, logger) => {
  const { stripeSubscriptionId } = job.payload

  await billingSvc.syncFromStripeId(stripeSubscriptionId)

  logger.info({ stripeSubscriptionId }, 'Stripe subscription synced')
}

// ---------------------------------------------------------------------------
// Fetches the most recent subscription for a Stripe customer and syncs it.
// ---------------------------------------------------------------------------

const stripe = container.get<Stripe>(TOKENS.StripeClient)

export const handleStripeSyncCustomer: JobHandler<
  Extract<JobPayload, { type: 'stripe.sync-customer' }>
> = async (job, logger) => {
  const { stripeCustomerId } = job.payload

  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status:   'all',
    limit:    1,
  })

  const stripeSub = subs.data[0]
  if (!stripeSub) {
    logger.warn({ stripeCustomerId }, 'No subscriptions found for Stripe customer — skipping')
    return
  }

  await billingSvc.syncFromStripeId(stripeSub.id)
  logger.info({ stripeCustomerId, stripeSubId: stripeSub.id }, 'Customer subscription synced')
}
