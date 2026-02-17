// ── Tenants ─────────────────────────────────────────────────────────────────

export type TenantStatus = 'trialing' | 'active' | 'suspended' | 'deleted'
export type IsolationMode = 'rls' | 'schema'

export interface Tenant {
  id: string
  slug: string
  name: string
  isolationMode: IsolationMode
  schemaName: string | null
  status: TenantStatus
  settings: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface NewTenant {
  slug: string
  name: string
  isolationMode?: IsolationMode
  status?: TenantStatus
  settings?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface PatchTenant {
  name?: string
  slug?: string
  status?: TenantStatus
  isolationMode?: IsolationMode
  schemaName?: string | null
  settings?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  emailVerified: boolean
  name: string | null
  avatarUrl: string | null
  isPlatformAdmin: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface NewUser {
  email: string
  emailVerified?: boolean
  name?: string | null
  avatarUrl?: string | null
}

export interface PatchUser {
  email?: string
  emailVerified?: boolean
  name?: string | null
  avatarUrl?: string | null
}

// ── OAuth Accounts ───────────────────────────────────────────────────────────

export type OAuthProvider = 'google' | 'github'

export interface OAuthAccount {
  id: string
  userId: string
  provider: OAuthProvider
  providerUserId: string
  providerEmail: string | null
  // Stored as PGP-encrypted ciphertext; decrypted in the service layer
  accessTokenEnc: string | null
  refreshTokenEnc: string | null
  tokenExpiresAt: Date | null
  rawProfile: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface NewOAuthAccount {
  userId: string
  provider: OAuthProvider
  providerUserId: string
  providerEmail?: string | null
  accessTokenEnc?: string | null
  refreshTokenEnc?: string | null
  tokenExpiresAt?: Date | null
  rawProfile?: Record<string, unknown>
}

// ── Memberships ───────────────────────────────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'member'
export type MemberStatus = 'active' | 'suspended'

export interface Membership {
  id: string
  tenantId: string
  userId: string
  role: MemberRole
  status: MemberStatus
  joinedAt: Date
  createdAt: Date
  updatedAt: Date
}

// Populated via JOIN in membership queries for convenience
export interface MembershipWithUser extends Membership {
  user: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>
}

export interface NewMembership {
  tenantId: string
  userId: string
  role?: MemberRole
  status?: MemberStatus
  joinedAt?: Date
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export interface PlanLimits {
  maxMembers: number | null
  maxApiKeys: number
  maxWebhooks: number
  storageBytes: number | null
}

export interface PlanFeatures {
  sso: boolean
  customDomain: boolean
  prioritySupport: boolean
  auditLogDays: number
  webhooks: boolean
  advancedAnalytics: boolean
}

export interface Plan {
  id: string
  name: string
  slug: string
  tier: number
  isolationMode: IsolationMode
  priceMonthlycents: number | null
  priceYearlyCents: number | null
  stripePriceMonthlyId: string | null
  stripePriceYearlyId: string | null
  limits: PlanLimits
  features: PlanFeatures
  isPublic: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'

export type BillingCycle = 'monthly' | 'yearly'

export interface Subscription {
  id: string
  tenantId: string
  planId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  status: SubscriptionStatus
  billingCycle: BillingCycle
  trialEndsAt: Date | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAt: Date | null
  canceledAt: Date | null
  stripeData: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan
}

// ── Feature Flags ─────────────────────────────────────────────────────────────

export type FlagScopeType = 'global' | 'plan' | 'tenant'

export interface FeatureFlag {
  id: string
  key: string
  scopeType: FlagScopeType
  scopeId: string | null
  enabled: boolean
  config: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface ResolvedFlag {
  key: string
  enabled: boolean
  config: Record<string, unknown>
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionData {
  role: MemberRole
  planSlug: string
  planId: string
  permissions: string[]
  /** Present only on impersonation sessions */
  impersonatorId?: string
  /** The admin's original session ID — used to restore on stop */
  impersonatorSessionId?: string
}

export interface Session {
  id: string
  userId: string
  tenantId: string | null
  data: SessionData
  ipAddress: string | null
  userAgent: string | null
  expiresAt: Date
  createdAt: Date
}

export interface NewSession {
  userId: string
  tenantId?: string | null
  data?: SessionData
  ipAddress?: string | null
  userAgent?: string | null
  expiresAt: Date
}

// ── Cache ─────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  key: string
  value: unknown
  tags: string[]
  expiresAt: Date | null
  createdAt: Date
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type JobPayload =
  | { type: 'email.send'; to: string; subject: string; template: string; vars: Record<string, unknown> }
  | { type: 'stripe.sync-subscription'; stripeSubscriptionId: string }
  | { type: 'stripe.sync-customer'; stripeCustomerId: string }
  | { type: 'webhook.deliver'; endpointId: string; eventType: string; payload: Record<string, unknown> }
  | { type: 'tenant.provision-schema'; tenantId: string }
  | { type: 'tenant.archive-audit-logs'; tenantId: string; beforeDate: string }
  | { type: 'invitation.send'; invitationId: string }

export interface Job {
  id: string
  queue: string
  type: JobPayload['type']
  payload: JobPayload
  status: JobStatus
  priority: number
  attempts: number
  maxAttempts: number
  runAt: Date
  startedAt: Date | null
  completedAt: Date | null
  error: { message: string; stack?: string; attempt: number } | null
  createdAt: Date
  updatedAt: Date
}

export interface NewJob {
  type: JobPayload['type']
  payload: JobPayload
  queue?: string
  priority?: number
  maxAttempts?: number
  runAt?: Date
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  tenantId: string
  userId: string | null
  action: string           // 'users.create', 'subscriptions.upgrade', etc.
  resourceType: string     // 'User', 'Subscription', 'ApiKey'
  resourceId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  metadata: Record<string, unknown>
  createdAt: Date
}

// ── Invitations ───────────────────────────────────────────────────────────────

export interface Invitation {
  id: string
  tenantId: string
  email: string
  role: MemberRole
  token: string
  invitedBy: string       // user.id
  acceptedAt: Date | null
  expiresAt: Date
  createdAt: Date
}

export interface NewInvitation {
  tenantId: string
  email: string
  role?: MemberRole
  invitedBy: string
  expiresAt?: Date
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  tenantId: string
  createdBy: string | null
  name: string
  prefix: string          // shown in UI (e.g. 'sk_live_Ab3x')
  keyHash: string         // SHA-256 hex; never returned to clients
  scopes: string[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

// Returned only at creation time — full key is never stored
export interface CreatedApiKey extends ApiKey {
  fullKey: string
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string
  tenantId: string
  url: string
  events: string[]
  secret: string          // HMAC signing secret; write-only after creation
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface NewWebhookEndpoint {
  tenantId: string
  url: string
  events?: string[]
}

export interface WebhookDelivery {
  id: string
  endpointId: string
  jobId: string | null
  eventType: string
  payload: Record<string, unknown>
  statusCode: number | null
  responseBody: string | null
  durationMs: number | null
  attempt: number
  deliveredAt: Date | null
  createdAt: Date
}
