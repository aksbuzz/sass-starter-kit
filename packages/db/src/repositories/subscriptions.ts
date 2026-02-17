import type { Sql } from 'postgres'
import type { Subscription, SubscriptionWithPlan, SubscriptionStatus, Plan, IsolationMode } from '../types.js'
import { NotFoundError } from '../errors.js'

// row_to_json(p.*) is evaluated by PostgreSQL and returns snake_case column names.
// postgres.camel only transforms top-level column names, not JSON values.
// We manually normalize the raw plan object so the response matches the Plan type.
type RawPlan = Record<string, unknown>

function normalizeRawPlan(p: RawPlan): Plan {
  const rawLimits   = (p['limits']   ?? {}) as Record<string, number | null>
  const rawFeatures = (p['features'] ?? {}) as Record<string, boolean | number>

  return {
    id:                   p['id']   as string,
    name:                 p['name'] as string,
    slug:                 p['slug'] as string,
    tier:                 p['tier'] as number,
    isolationMode:        (p['isolation_mode']  ?? p['isolationMode'])  as IsolationMode,
    priceMonthlycents:    (p['price_monthly_cents'] ?? p['priceMonthlycents'] ?? null) as number | null,
    priceYearlyCents:     (p['price_yearly_cents']  ?? p['priceYearlyCents']  ?? null) as number | null,
    stripePriceMonthlyId: (p['stripe_price_monthly_id'] ?? p['stripePriceMonthlyId'] ?? null) as string | null,
    stripePriceYearlyId:  (p['stripe_price_yearly_id']  ?? p['stripePriceYearlyId']  ?? null) as string | null,
    isPublic:             (p['is_public'] ?? p['isPublic']) as boolean,
    isActive:             (p['is_active'] ?? p['isActive']) as boolean,
    createdAt:            (p['created_at'] ?? p['createdAt']) as Date,
    updatedAt:            (p['updated_at'] ?? p['updatedAt']) as Date,
    limits: {
      maxMembers:   (rawLimits['max_members']   ?? rawLimits['maxMembers']   ?? null) as number | null,
      maxApiKeys:   (rawLimits['max_api_keys']  ?? rawLimits['maxApiKeys']   ?? 0)    as number,
      maxWebhooks:  (rawLimits['max_webhooks']  ?? rawLimits['maxWebhooks']  ?? 0)    as number,
      storageBytes: (rawLimits['storage_bytes'] ?? rawLimits['storageBytes'] ?? null) as number | null,
    },
    features: {
      sso:               (rawFeatures['sso']                ?? false) as boolean,
      customDomain:      (rawFeatures['custom_domain']      ?? rawFeatures['customDomain']      ?? false) as boolean,
      prioritySupport:   (rawFeatures['priority_support']   ?? rawFeatures['prioritySupport']   ?? false) as boolean,
      auditLogDays:      (rawFeatures['audit_log_days']     ?? rawFeatures['auditLogDays']      ?? 30)    as number,
      webhooks:          (rawFeatures['webhooks']           ?? false) as boolean,
      advancedAnalytics: (rawFeatures['advanced_analytics'] ?? rawFeatures['advancedAnalytics'] ?? false) as boolean,
    },
  }
}

export class SubscriptionsRepository {
  constructor(private readonly sql: Sql) {}

  async findByTenantId(tenantId: string): Promise<SubscriptionWithPlan | null> {
    const rows = await this.sql<(Subscription & { plan: RawPlan })[]>`
      SELECT
        s.*,
        row_to_json(p.*) AS plan
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ${tenantId}
    `
    if (!rows[0]) return null
    return { ...rows[0], plan: normalizeRawPlan(rows[0].plan) }
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Subscription | null> {
    const rows = await this.sql<Subscription[]>`
      SELECT * FROM subscriptions WHERE stripe_customer_id = ${stripeCustomerId}
    `
    return rows[0] ?? null
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const rows = await this.sql<Subscription[]>`
      SELECT * FROM subscriptions WHERE stripe_subscription_id = ${stripeSubscriptionId}
    `
    return rows[0] ?? null
  }

  async create(data: {
    tenantId: string
    planId: string
    status?: SubscriptionStatus
    billingCycle?: 'monthly' | 'yearly'
    trialEndsAt?: Date | null
    stripeCustomerId?: string | null
  }): Promise<Subscription> {
    const rows = await this.sql<Subscription[]>`
      INSERT INTO subscriptions (
        tenant_id, plan_id, status, billing_cycle, trial_ends_at, stripe_customer_id
      ) VALUES (
        ${data.tenantId},
        ${data.planId},
        ${data.status ?? 'trialing'},
        ${data.billingCycle ?? 'monthly'},
        ${data.trialEndsAt ?? null},
        ${data.stripeCustomerId ?? null}
      )
      ON CONFLICT (tenant_id) DO UPDATE
        SET plan_id    = EXCLUDED.plan_id,
            status     = EXCLUDED.status,
            updated_at = NOW()
      RETURNING *
    `
    return rows[0]!
  }

  async updateStripeIds(
    tenantId:             string,
    data: { stripeCustomerId: string; stripeSubscriptionId: string },
  ): Promise<void> {
    await this.sql`
      UPDATE subscriptions
         SET stripe_customer_id     = ${data.stripeCustomerId},
             stripe_subscription_id = ${data.stripeSubscriptionId},
             updated_at             = NOW()
       WHERE tenant_id = ${tenantId}
    `
  }

  async syncFromStripe(data: {
    stripeSubscriptionId: string
    stripeCustomerId: string
    planId: string
    status: SubscriptionStatus
    billingCycle: 'monthly' | 'yearly'
    currentPeriodStart: Date
    currentPeriodEnd: Date
    trialEndsAt: Date | null
    cancelAt: Date | null
    canceledAt: Date | null
    stripeData: Record<string, unknown>
  }): Promise<Subscription> {
    const rows = await this.sql<Subscription[]>`
      UPDATE subscriptions
         SET plan_id               = ${data.planId},
             status                = ${data.status},
             billing_cycle         = ${data.billingCycle},
             current_period_start  = ${data.currentPeriodStart},
             current_period_end    = ${data.currentPeriodEnd},
             trial_ends_at         = ${data.trialEndsAt},
             cancel_at             = ${data.cancelAt},
             canceled_at           = ${data.canceledAt},
             stripe_data           = ${this.sql.json(data.stripeData as unknown as Parameters<(typeof this.sql)['json']>[0])},
             updated_at            = NOW()
       WHERE stripe_subscription_id = ${data.stripeSubscriptionId}
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('Subscription', data.stripeSubscriptionId)
    return rows[0]
  }
}
