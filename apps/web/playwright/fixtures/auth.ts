import type { Page, BrowserContext } from '@playwright/test'

const SESSION_STORAGE_KEY = 'saas_access_token'
const SESSION_COOKIE_NAME = 'saas_session'
const API_URL = 'http://localhost:3001'

export interface MockJwtOptions {
  userId?: string
  sessionId?: string
  tenantId?: string | null
  role?: 'owner' | 'admin' | 'member' | null
  expiresInSeconds?: number
}

/**
 * Creates a mock JWT token that the auth slice can decode.
 * Uses Node.js Buffer for base64url encoding.
 */
export function createMockJwt(options: MockJwtOptions = {}): string {
  const {
    userId = 'user-test-123',
    sessionId = 'session-test-123',
    tenantId = 'tenant-test-123',
    role = 'owner',
    expiresInSeconds = 3600,
  } = options

  const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'

  const payloadObj = {
    purpose: 'access',
    sub: userId,
    sid: sessionId,
    tid: tenantId,
    role,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000),
  }

  const payload = Buffer.from(JSON.stringify(payloadObj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${header}.${payload}.mock-signature-for-testing`
}

/**
 * Sets up an authenticated browser context by:
 * 1. Adding the saas_session cookie (passes middleware check)
 * 2. Injecting a valid JWT into sessionStorage via addInitScript
 *    (picked up by useAuth on mount)
 */
export async function setupAuth(
  page: Page,
  options: MockJwtOptions = {},
): Promise<string> {
  const token = createMockJwt(options)

  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: '1',
      domain: 'localhost',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
  ])

  await page.addInitScript(
    ({ key, token: t }) => {
      sessionStorage.setItem(key, t)
    },
    { key: SESSION_STORAGE_KEY, token },
  )

  return token
}

export async function setupAuthNoTenant(page: Page): Promise<string> {
  return setupAuth(page, { tenantId: null, role: null })
}

/**
 * Mocks the /auth/refresh endpoint to return the given token.
 * This prevents 401 loops if the token is not in sessionStorage.
 */
export async function mockRefreshEndpoint(page: Page, token: string): Promise<void> {
  await page.route(`${API_URL}/auth/refresh`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: token }),
    })
  })
}

/**
 * Mocks the /auth/logout endpoint to return 204.
 */
export async function mockLogoutEndpoint(page: Page): Promise<void> {
  await page.route(`${API_URL}/auth/logout`, async (route) => {
    await route.fulfill({ status: 204 })
  })
}
