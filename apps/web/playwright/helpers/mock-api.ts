import type { Page } from '@playwright/test'

const API_URL       = 'http://localhost:3001'
const ADMIN_API_URL = 'http://localhost:3002'

// ── Shared mock data ─────────────────────────────────────────────────────────

export const MOCK_IDS = {
  userId: 'user-test-123',
  tenantId: 'tenant-test-123',
  sessionId: 'session-test-123',
  membershipId: 'membership-test-123',
  apiKeyId: 'apikey-test-123',
  webhookId: 'webhook-test-123',
  invitationId: 'invitation-test-123',
}

export const MOCK_TENANT = {
  id: MOCK_IDS.tenantId,
  slug: 'acme-corp',
  name: 'Acme Corp',
  isolationMode: 'shared',
  status: 'active',
  settings: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

export const MOCK_PLAN = {
  id: 'plan-starter',
  name: 'Starter',
  slug: 'starter',
  tier: 0,
  priceMonthlyCents: 0,
  priceYearlyCents: 0,
  limits: { maxMembers: 5, maxApiKeys: 5, maxWebhooks: 3, storageBytes: null as number | null },
  features: { sso: false, customDomain: false, prioritySupport: false, auditLogDays: 30, webhooks: false, advancedAnalytics: false },
  isPublic: true,
  isActive: true,
}

export const MOCK_SUBSCRIPTION = {
  id: 'sub-test-123',
  status: 'trialing',
  billingCycle: 'monthly',
  trialEndsAt: '2026-03-01T00:00:00Z',
  currentPeriodStart: '2026-02-01T00:00:00Z',
  currentPeriodEnd: '2026-03-01T00:00:00Z',
  cancelAt: null,
  plan: MOCK_PLAN,
}

export const MOCK_MEMBERSHIP = {
  id: MOCK_IDS.membershipId,
  role: 'owner',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00Z',
}

export const MOCK_WORKSPACE_CONTEXT = {
  tenant: MOCK_TENANT,
  membership: MOCK_MEMBERSHIP,
  memberCount: 1,
  subscription: MOCK_SUBSCRIPTION,
  flags: {
    advanced_analytics: { enabled: true, value: null },
    custom_domain: { enabled: false, value: null },
  },
}

export const MOCK_MEMBER = {
  id: MOCK_IDS.membershipId,
  role: 'owner',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00Z',
  userId: MOCK_IDS.userId,
  tenantId: MOCK_IDS.tenantId,
  user: {
    id: MOCK_IDS.userId,
    email: 'owner@example.com',
    name: 'Test Owner',
    avatarUrl: null,
  },
}

export const MOCK_API_KEY = {
  id: MOCK_IDS.apiKeyId,
  name: 'CI Pipeline Key',
  prefix: 'sk_live_xxxx',
  scopes: ['read'],
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null as string | null,
  createdAt: '2026-01-01T00:00:00Z',
}

export const MOCK_WEBHOOK = {
  id: MOCK_IDS.webhookId,
  url: 'https://webhook.site/test-endpoint',
  events: ['member.invited', 'api_key.created'],
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

export const MOCK_AUDIT_LOG = {
  id: 'auditlog-test-123',
  userId: MOCK_IDS.userId,
  action: 'api_key.created',
  resourceType: 'api_key',
  resourceId: MOCK_IDS.apiKeyId,
  before: null,
  after: { name: 'CI Pipeline Key' },
  createdAt: '2026-01-01T00:00:00Z',
}

export const MOCK_WORKSPACES = [
  {
    tenantId: MOCK_IDS.tenantId,
    tenantName: 'Acme Corp',
    tenantSlug: 'acme-corp',
    role: 'owner',
    joinedAt: '2026-01-01T00:00:00Z',
  },
  {
    tenantId: 'tenant-second-456',
    tenantName: 'Second Org',
    tenantSlug: 'second-org',
    role: 'member',
    joinedAt: '2026-01-15T00:00:00Z',
  },
]

// ── Route mocking helpers ────────────────────────────────────────────────────

type RouteOptions = { status?: number; body: unknown }

async function mockRoute(page: Page, path: string, opts: RouteOptions) {
  await page.route(`${API_URL}${path}`, async (route) => {
    await route.fulfill({
      status: opts.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.body),
    })
  })
}

/** Mock GET /tenants/me → WorkspaceContext */
export async function mockWorkspaceMe(page: Page, data = MOCK_WORKSPACE_CONTEXT) {
  await mockRoute(page, '/tenants/me', { body: data })
}

/** Mock GET /tenants → workspace list */
export async function mockTenantsList(page: Page, workspaces = MOCK_WORKSPACES) {
  await mockRoute(page, '/tenants', { body: { workspaces } })
}

/** Mock POST /admin/tenants → create tenant (platform admin only).
 *  Uses regex to match regardless of ADMIN_API_URL port. */
export async function mockCreateTenant(page: Page) {
  await page.route(/\/admin\/tenants$/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ tenant: MOCK_TENANT, invitationToken: null }),
      })
    } else {
      await route.fulfill({ status: 204 })
    }
  })
}

/** Mock POST /auth/workspace → select workspace */
export async function mockSelectWorkspace(page: Page, token: string) {
  await mockRoute(page, '/auth/workspace', { body: { accessToken: token } })
}

/** Mock GET /api-keys → list */
export async function mockApiKeysList(page: Page, apiKeys = [MOCK_API_KEY]) {
  await mockRoute(page, '/api-keys', { body: { apiKeys } })
}

/** Mock GET /tenants/me/members → list */
export async function mockMembersList(page: Page, members = [MOCK_MEMBER]) {
  await mockRoute(page, '/tenants/me/members', { body: { members } })
}

/** Mock GET /webhooks → list */
export async function mockWebhooksList(page: Page, endpoints = [MOCK_WEBHOOK]) {
  await mockRoute(page, '/webhooks', { body: { endpoints } })
}

/** Mock GET /billing/subscription */
export async function mockBillingSubscription(page: Page, subscription: unknown = MOCK_SUBSCRIPTION) {
  await mockRoute(page, '/billing/subscription', { body: { subscription } })
}

/** Mock GET /billing/plans */
export async function mockBillingPlans(page: Page, plans: unknown[] = [MOCK_PLAN]) {
  await mockRoute(page, '/billing/plans', { body: { plans } })
}

/** Mock GET /audit-logs */
export async function mockAuditLogs(page: Page, logs = [MOCK_AUDIT_LOG]) {
  await page.route(`${API_URL}/audit-logs*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows:   logs,
        total:  logs.length,
        limit:  20,
        offset: 0,
      }),
    })
  })
}

/** Mock DELETE /api-keys/:id → 204 */
export async function mockRevokeApiKey(page: Page) {
  await page.route(`${API_URL}/api-keys/*`, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 })
    } else {
      await route.continue()
    }
  })
}

/** Mock DELETE /tenants/me → 204 */
export async function mockDeleteTenant(page: Page) {
  await page.route(`${API_URL}/tenants/me`, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 })
    } else {
      await route.continue()
    }
  })
}

/** Mock PATCH /tenants/me → updated tenant */
export async function mockUpdateTenant(page: Page) {
  await page.route(`${API_URL}/tenants/me`, async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tenant: { ...MOCK_TENANT, name: 'Updated Name' } }),
      })
    } else {
      await route.continue()
    }
  })
}
