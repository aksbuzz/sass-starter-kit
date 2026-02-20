import { injectable, inject }   from 'inversify'
import Stripe                    from 'stripe'
import {
  withAdmin,
  ForbiddenError,
  ConflictError,
  NotFoundError,
  type Plan,
  type BillingCycle,
  type SubscriptionStatus,
  type SubscriptionWithPlan,
} from '@saas/db'
import type pino                 from 'pino'
import { TOKENS }                from '../container/tokens.js'
import { config }                from '../config.js'
import type { RequestContext }   from '../types.js'

// ---------------------------------------------------------------------------
// Webhook flow:
//   Stripe → POST /billing/webhook (raw body, signature-verified)
//     checkout.session.completed  → link Stripe IDs → syncSubscription()
//     subscription.updated/deleted → syncSubscription()
//     invoice.payment_failed       → mark past_due (full sync follows from sub.updated)
// ---------------------------------------------------------------------------

@injectable()
export class BillingService {
  constructor(
    @inject(TOKENS.StripeClient) private readonly stripe: Stripe,
    @inject(TOKENS.Logger)       private readonly logger:  pino.Logger,
  ) {}

  async listPlans(): Promise<Plan[]> {
    return withAdmin(({ repos }) => repos.plans.listPublic())
  }

  async getSubscription(ctx: RequestContext): Promise<SubscriptionWithPlan | null> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')
    return withAdmin(({ repos }) => repos.subscriptions.findByTenantId(ctx.tenantId!))
  }

  // Creates a hosted checkout page URL. Frontend redirects the user there.
  // client_reference_id binds the checkout to our tenantId so the webhook
  // knows which subscription to activate.

  async createCheckoutSession(
    ctx:  RequestContext,
    data: { planSlug: string; billingCycle: BillingCycle },
  ): Promise<{ url: string }> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withAdmin(async ({ repos }) => {
      const [subscription, plan, user] = await Promise.all([
        repos.subscriptions.findByTenantId(ctx.tenantId!),
        repos.plans.findBySlug(data.planSlug),
        repos.users.findByIdOrThrow(ctx.userId),
      ])

      if (!plan) throw new NotFoundError('Plan', data.planSlug)
      if (!plan.isPublic) throw new ForbiddenError('Plan is not available for self-service checkout')

      const priceId = data.billingCycle === 'yearly'
        ? plan.stripePriceYearlyId
        : plan.stripePriceMonthlyId

      if (!priceId) {
        throw new Error(`Plan '${data.planSlug}' has no Stripe price ID for ${data.billingCycle} billing`)
      }

      const params: Stripe.Checkout.SessionCreateParams = {
        mode:                'subscription',
        line_items:          [{ price: priceId, quantity: 1 }],
        client_reference_id: ctx.tenantId!,
        success_url:         `${config.WEB_URL}/settings/billing?checkout=success`,
        cancel_url:          `${config.WEB_URL}/settings/billing?checkout=canceled`,
        metadata:            { tenantId: ctx.tenantId!, billingCycle: data.billingCycle },
        subscription_data:   { metadata: { tenantId: ctx.tenantId! } },
      }

      if (subscription?.stripeCustomerId) {
        params.customer = subscription.stripeCustomerId
      } else {
        params.customer_email = user.email
      }

      const session = await this.stripe.checkout.sessions.create(params)
      if (!session.url) throw new Error('Stripe did not return a checkout URL')

      this.logger.info({ tenantId: ctx.tenantId, planSlug: data.planSlug, billingCycle: data.billingCycle }, 'Checkout session created')
      return { url: session.url }
    })
  }

  // Opens the hosted portal where customers can update payment methods,
  // download invoices, cancel, or upgrade. Requires an existing Stripe customer.

  async createPortalSession(ctx: RequestContext): Promise<{ url: string }> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withAdmin(async ({ repos }) => {
      const subscription = await repos.subscriptions.findByTenantId(ctx.tenantId!)

      if (!subscription?.stripeCustomerId) {
        throw new ConflictError('No Stripe customer found — complete a checkout first to enable billing management')
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer:   subscription.stripeCustomerId,
        return_url: `${config.WEB_URL}/settings/billing`,
      })

      return { url: session.url }
    })
  }

  // rawBody must be the unmodified request buffer — Stripe verifies the HMAC
  // signature against the exact bytes received, so JSON.parse/re-stringify breaks it.

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET)
    } catch {
      throw Object.assign(new Error('Webhook signature verification failed'), { statusCode: 400 })
    }

    this.logger.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received')

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChanged(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        this.logger.debug({ eventType: event.type }, 'Unhandled Stripe event — ignoring')
    }
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    if (session.mode !== 'subscription') return

    const tenantId         = session.client_reference_id
    const stripeCustomerId = typeof session.customer     === 'string' ? session.customer     : null
    const stripeSubId      = typeof session.subscription === 'string' ? session.subscription : null

    if (!tenantId || !stripeCustomerId || !stripeSubId) {
      this.logger.warn({ sessionId: session.id }, 'checkout.session.completed: missing required IDs — skipping')
      return
    }

    // Step 1 — link Stripe IDs onto the subscription row so syncFromStripe can find it
    await withAdmin(({ repos }) => repos.subscriptions.updateStripeIds(tenantId, {
      stripeCustomerId,
      stripeSubscriptionId: stripeSubId,
    }))

    // Step 2 — full sync from Stripe (now findable by stripe_subscription_id)
    const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubId)
    await this.syncSubscription(stripeSub)

    this.logger.info({ tenantId, stripeSubId }, 'Checkout completed — subscription activated')
  }

  private async onSubscriptionChanged(stripeSub: Stripe.Subscription): Promise<void> {
    await this.syncSubscription(stripeSub)
  }

  private async onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // invoice.subscription can be a string ID or expanded object
    const subId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : (invoice.subscription as Stripe.Subscription | null)?.id

    if (!subId) return

    await withAdmin(async ({ repos }) => {
      const sub = await repos.subscriptions.findByStripeSubscriptionId(subId)
      if (!sub) {
        this.logger.warn({ stripeSubId: subId }, 'invoice.payment_failed: subscription not in DB')
        return
      }

      // Minimal status patch; Stripe will fire customer.subscription.updated shortly after,
      // which triggers a full sync via syncSubscription().
      await repos.subscriptions.syncFromStripe({
        stripeSubscriptionId: subId,
        stripeCustomerId:     typeof invoice.customer === 'string' ? invoice.customer : sub.stripeCustomerId!,
        planId:               sub.planId,
        status:               'past_due',
        billingCycle:         sub.billingCycle,
        currentPeriodStart:   sub.currentPeriodStart ?? new Date(),
        currentPeriodEnd:     sub.currentPeriodEnd   ?? new Date(),
        trialEndsAt:          sub.trialEndsAt,
        cancelAt:             sub.cancelAt,
        canceledAt:           sub.canceledAt,
        stripeData:           { invoiceId: invoice.id, invoiceStatus: invoice.status },
      })
    })

    this.logger.warn({ stripeSubId: subId }, 'Payment failed — subscription marked past_due')
  }

  async syncFromStripeId(stripeSubscriptionId: string): Promise<void> {
    const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId)
    await this.syncSubscription(stripeSub)
  }

  private async syncSubscription(stripeSub: Stripe.Subscription): Promise<void> {
    const item = stripeSub.items.data[0]
    if (!item) return

    const priceId = item.price.id
    const plan    = await withAdmin(({ repos }) => repos.plans.findByStripePriceId(priceId))

    if (!plan) {
      this.logger.warn({ stripePriceId: priceId }, 'No plan matched Stripe price ID — skipping sync')
      return
    }

    const billingCycle: BillingCycle = item.price.recurring?.interval === 'year' ? 'yearly' : 'monthly'
    const stripeCustomerId = typeof stripeSub.customer === 'string'
      ? stripeSub.customer
      : (stripeSub.customer as Stripe.Customer | Stripe.DeletedCustomer).id

    await withAdmin(({ repos }) => repos.subscriptions.syncFromStripe({
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId,
      planId:               plan.id,
      status:               this.mapStripeStatus(stripeSub.status),
      billingCycle,
      currentPeriodStart:   new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:     new Date(stripeSub.current_period_end   * 1000),
      trialEndsAt:          stripeSub.trial_end   ? new Date(stripeSub.trial_end   * 1000) : null,
      cancelAt:             stripeSub.cancel_at   ? new Date(stripeSub.cancel_at   * 1000) : null,
      canceledAt:           stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      stripeData: JSON.parse(JSON.stringify(stripeSub)) as Record<string, unknown>,
    }))

    this.logger.info({
      stripeSubId: stripeSub.id,
      status:      stripeSub.status,
      planId:      plan.id,
    }, 'Subscription synced from Stripe')
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const map: Partial<Record<Stripe.Subscription.Status, SubscriptionStatus>> = {
      active:             'active',
      trialing:           'trialing',
      past_due:           'past_due',
      canceled:           'canceled',
      unpaid:             'unpaid',
      incomplete:         'incomplete',
      incomplete_expired: 'canceled',
      paused:             'canceled',
    }
    return map[status] ?? 'canceled'
  }
}
