import type { Sql } from 'postgres'
import type { Plan, PlanLimits, PlanFeatures } from '../types.js'
import { NotFoundError } from '../errors.js'

// postgres.camel transforms column names (e.g. is_active → isActive) but does NOT
// transform keys inside JSONB values. The limits/features columns store snake_case
// keys in the DB, so we normalize them here.
function normalizePlan(plan: Plan): Plan {
  const rawLimits   = plan.limits   as unknown as Record<string, number | null>
  const rawFeatures = plan.features as unknown as Record<string, boolean | number>

  const limits: PlanLimits = {
    maxMembers:   rawLimits['max_members']   ?? rawLimits['maxMembers']   ?? null,
    maxApiKeys:   (rawLimits['max_api_keys']  ?? rawLimits['maxApiKeys']   ?? 0) as number,
    maxWebhooks:  (rawLimits['max_webhooks']  ?? rawLimits['maxWebhooks']  ?? 0) as number,
    storageBytes: rawLimits['storage_bytes'] ?? rawLimits['storageBytes'] ?? null,
  }

  const features: PlanFeatures = {
    sso:               (rawFeatures['sso']                ?? false) as boolean,
    customDomain:      (rawFeatures['custom_domain']      ?? rawFeatures['customDomain']      ?? false) as boolean,
    prioritySupport:   (rawFeatures['priority_support']   ?? rawFeatures['prioritySupport']   ?? false) as boolean,
    auditLogDays:      (rawFeatures['audit_log_days']     ?? rawFeatures['auditLogDays']      ?? 30)    as number,
    webhooks:          (rawFeatures['webhooks']           ?? false) as boolean,
    advancedAnalytics: (rawFeatures['advanced_analytics'] ?? rawFeatures['advancedAnalytics'] ?? false) as boolean,
  }

  return { ...plan, limits, features }
}

export class PlansRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<Plan | null> {
    const rows = await this.sql<Plan[]>`
      SELECT * FROM plans WHERE id = ${id} AND is_active = true
    `
    return rows[0] ? normalizePlan(rows[0]) : null
  }

  async findByIdOrThrow(id: string): Promise<Plan> {
    const plan = await this.findById(id)
    if (!plan) throw new NotFoundError('Plan', id)
    return plan
  }

  async findBySlug(slug: string): Promise<Plan | null> {
    const rows = await this.sql<Plan[]>`
      SELECT * FROM plans WHERE slug = ${slug} AND is_active = true
    `
    return rows[0] ? normalizePlan(rows[0]) : null
  }

  async findByStripePriceId(priceId: string): Promise<Plan | null> {
    const rows = await this.sql<Plan[]>`
      SELECT * FROM plans
      WHERE  (stripe_price_monthly_id = ${priceId} OR stripe_price_yearly_id = ${priceId})
        AND  is_active = true
    `
    return rows[0] ? normalizePlan(rows[0]) : null
  }

  async listPublic(): Promise<Plan[]> {
    const rows = await this.sql<Plan[]>`
      SELECT * FROM plans
      WHERE  is_public = true AND is_active = true
      ORDER BY tier ASC
    `
    return rows.map(normalizePlan)
  }

  async listAll(): Promise<Plan[]> {
    const rows = await this.sql<Plan[]>`SELECT * FROM plans WHERE is_active = true ORDER BY tier ASC`
    return rows.map(normalizePlan)
  }
}
