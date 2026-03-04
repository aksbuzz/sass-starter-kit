// ── Client-side route constants ────────────────────────────────────────────────
export const ROUTES = {
  login:           '/login',
  authCallback:    '/auth/callback',
  workspacePicker: '/workspace-picker',
  dashboard:       '/',
  team:            '/team',
  apiKeys:         '/api-keys',
  billing:         '/billing',
  settings:        '/settings',
  webhooks:        '/webhooks',
  auditLog:        '/audit-log',
  featureFlags:    '/feature-flags',
  // Control plane (platform admin)
  adminTenants:    '/admin/tenants',
  adminUsers:      '/admin/users',
  adminFlags:      '/admin/feature-flags',
} as const

// ── API path constants ─────────────────────────────────────────────────────────
export const API_PATHS = {
  auth: {
    google:            '/auth/google',
    github:            '/auth/github',
    refresh:           '/auth/refresh',
    logout:            '/auth/logout',
    workspace:         '/auth/workspace',
    exchange:          '/auth/exchange',
    impersonate:       '/auth/impersonate',
    stopImpersonation: '/auth/stop-impersonation',
  },
  tenants: {
    list:        '/tenants',
    me:          '/tenants/me',
    members:     '/tenants/me/members',
    invitations: '/tenants/me/invitations',
    inviteMember:            '/tenants/me/members/invite',
    memberRole:  (id: string) => `/tenants/me/members/${id}/role`,
    removeMember:(id: string) => `/tenants/me/members/${id}`,
    cancelInvite:(id: string) => `/tenants/me/invitations/${id}`,
  },
  apiKeys: {
    list:   '/api-keys',
    create: '/api-keys',
    revoke: (id: string) => `/api-keys/${id}`,
  },
  billing: {
    plans:        '/billing/plans',
    subscription: '/billing/subscription',
    checkout:     '/billing/checkout',
    portal:       '/billing/portal',
  },
  webhooks: {
    list:       '/webhooks',
    create:     '/webhooks',
    update:     (id: string) => `/webhooks/${id}`,
    delete:     (id: string) => `/webhooks/${id}`,
    deliveries: (id: string) => `/webhooks/${id}/deliveries`,
  },
  auditLogs: '/audit-logs',
  featureFlags: {
    list:    '/feature-flags',
    resolve: '/feature-flags/resolve',
    upsert:  (key: string) => `/feature-flags/${key}`,
    delete:  (key: string) => `/feature-flags/${key}`,
  },
  health: '/health',
  // Control plane (platform admin)
  admin: {
    stats:        '/admin/stats',
    tenants: {
      list:   '/admin/tenants',
      create: '/admin/tenants',
      get:    (id: string) => `/admin/tenants/${id}`,
      update: (id: string) => `/admin/tenants/${id}`,
      delete: (id: string) => `/admin/tenants/${id}`,
    },
    users: {
      list: '/admin/users',
    },
    featureFlags: {
      list:   '/admin/feature-flags',
      upsert: (key: string) => `/admin/feature-flags/${key}`,
      delete: (key: string) => `/admin/feature-flags/${key}`,
    },
  },
} as const

// ── Plan slugs ────────────────────────────────────────────────────────────────
export const PLAN_SLUGS = {
  starter:    'starter',
  growth:     'growth',
  enterprise: 'enterprise',
} as const

// ── Member roles ──────────────────────────────────────────────────────────────
export const MEMBER_ROLES = ['owner', 'admin', 'member'] as const
export type MemberRole = typeof MEMBER_ROLES[number]

// ── Webhook event types ───────────────────────────────────────────────────────
export const WEBHOOK_EVENTS = [
  'user.created',
  'tenant.created',
  'tenant.deleted',
  'member.invited',
  'member.joined',
  'member.removed',
  'subscription.upgraded',
  'subscription.canceled',
  'api_key.created',
  'api_key.revoked',
] as const

export type WebhookEvent = typeof WEBHOOK_EVENTS[number]

// ── Session storage key ───────────────────────────────────────────────────────
export const SESSION_STORAGE_KEY = 'saas_access_token'
export const SESSION_COOKIE_NAME = 'saas_session'
