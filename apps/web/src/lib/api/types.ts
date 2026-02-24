// ── Auth ──────────────────────────────────────────────────────────────────────
export interface AccessTokenPayload {
  purpose: 'access'
  sub: string        // userId
  sid: string        // sessionId
  tid: string | null // tenantId (null before workspace selection)
  role: 'owner' | 'admin' | 'member' | null
  imp?: string       // impersonator userId — present only during impersonation
  exp: number
  iat: number
}

export interface RefreshResponse {
  accessToken: string
}

// ── Workspaces ────────────────────────────────────────────────────────────────
export interface WorkspaceListItem {
  tenantId:   string
  tenantName: string
  tenantSlug: string
  role:       'owner' | 'admin' | 'member'
  joinedAt:   string
}

export interface Tenant {
  id:            string
  slug:          string
  name:          string
  isolationMode: string
  status:        'trialing' | 'active' | 'suspended' | 'deleted'
  settings:      Record<string, unknown>
  createdAt:     string
  updatedAt:     string
}

export interface Membership {
  id:       string
  role:     'owner' | 'admin' | 'member'
  status:   'active' | 'suspended'
  joinedAt: string
}

export interface MemberWithUser extends Membership {
  userId:    string
  tenantId:  string
  user: {
    id:        string
    email:     string
    name:      string | null
    avatarUrl: string | null
  }
}

export interface Plan {
  id:                  string
  name:                string
  slug:                string
  tier:                number
  priceMonthlyCents:   number | null
  priceYearlyCents:    number | null
  limits: {
    maxMembers:   number | null
    maxApiKeys:   number
    maxWebhooks:  number
    storageBytes: number | null
  }
  features: {
    sso:               boolean
    customDomain:      boolean
    prioritySupport:   boolean
    auditLogDays:      number
    webhooks:          boolean
    advancedAnalytics: boolean
  }
  isPublic:  boolean
  isActive:  boolean
}

export interface Subscription {
  id:                 string
  status:             'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'
  billingCycle:       'monthly' | 'yearly'
  trialEndsAt:        string | null
  currentPeriodStart: string | null
  currentPeriodEnd:   string | null
  cancelAt:           string | null
  plan:               Plan
}

export interface ResolvedFlag {
  key:     string
  enabled: boolean
  config:  Record<string, unknown>
}

export interface WorkspaceContext {
  tenant:      Tenant
  membership:  Membership
  memberCount: number
  subscription: Subscription | null
  flags: Record<string, ResolvedFlag>
}

// ── API Keys ──────────────────────────────────────────────────────────────────
export interface ApiKey {
  id:         string
  name:       string
  prefix:     string
  scopes:     string[]
  lastUsedAt: string | null
  expiresAt:  string | null
  revokedAt:  string | null
  createdAt:  string
}

export interface CreatedApiKey extends ApiKey {
  fullKey: string
}

// ── Invitations ───────────────────────────────────────────────────────────────
export interface Invitation {
  id:         string
  email:      string
  role:       'owner' | 'admin' | 'member'
  expiresAt:  string
  createdAt:  string
}

// ── Webhooks ──────────────────────────────────────────────────────────────────
export interface WebhookEndpoint {
  id:        string
  url:       string
  events:    string[]
  isActive:  boolean
  createdAt: string
  updatedAt: string
}

export interface WebhookDelivery {
  id:          string
  eventType:   string
  statusCode:  number | null
  responseBody:string | null
  durationMs:  number | null
  attempt:     number
  deliveredAt: string | null
  createdAt:   string
}

// ── Feature Flags ─────────────────────────────────────────────────────────────
export interface FeatureFlagOverride {
  id:        string
  key:       string
  scopeType: string
  scopeId:   string | null
  enabled:   boolean
  config:    Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
export interface AuditLog {
  id:           string
  userId:       string | null
  action:       string
  resourceType: string
  resourceId:   string | null
  before:       Record<string, unknown> | null
  after:        Record<string, unknown> | null
  createdAt:    string
}

// ── API error ─────────────────────────────────────────────────────────────────
export interface ApiError {
  statusCode: number
  error:      string
  message:    string
}
