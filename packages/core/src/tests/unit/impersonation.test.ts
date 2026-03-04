import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

// ── Mock repos ──────────────────────────────────────────────────────────────

const { mockRepos, mockCache } = vi.hoisted(() => ({
  mockRepos: {
    users: {
      findById:        vi.fn(),
      findByIdOrThrow: vi.fn(),
    },
    memberships: {
      findTenantsForUser: vi.fn(),
    },
    sessions: {
      create:             vi.fn(),
      findValid:          vi.fn(),
      findValidForUpdate: vi.fn(),
      deleteById:         vi.fn(),
    },
    subscriptions: {
      findByTenantId: vi.fn(),
    },
    auditLogs: {
      create: vi.fn(),
    },
    apiKeys: {
      countActive:    vi.fn(),
      create:         vi.fn(),
      findById:       vi.fn(),
      findByTenantId: vi.fn(),
      revoke:         vi.fn(),
    },
  },
  mockCache: {
    set:          vi.fn(),
    getAndDelete: vi.fn(),
  },
}))

vi.mock('@saas/db', () => {
  class NotFoundError extends Error {
    readonly code = 'NOT_FOUND'
    constructor(entity: string, id: string) {
      super(`${entity} not found: ${id}`)
      this.name = 'NotFoundError'
    }
  }
  class ForbiddenError extends Error {
    readonly code = 'FORBIDDEN'
    constructor(message = 'Insufficient permissions') {
      super(message)
      this.name = 'ForbiddenError'
    }
  }
  class PlanLimitError extends Error {
    readonly code = 'PLAN_LIMIT_EXCEEDED'
    constructor(readonly limit: string, readonly current: number, readonly max: number) {
      super(`Plan limit reached for ${limit}: ${current}/${max}`)
      this.name = 'PlanLimitError'
    }
  }

  return {
    NotFoundError,
    ForbiddenError,
    PlanLimitError,
    withAdmin: (fn: (ctx: { repos: typeof mockRepos }) => Promise<unknown>) =>
      fn({ repos: mockRepos }),
    withTenant: (_opts: unknown, fn: (ctx: { repos: typeof mockRepos }) => Promise<unknown>) =>
      fn({ repos: mockRepos }),
    UsersRepository: vi.fn().mockImplementation(() => mockRepos.users),
    SessionsRepository: vi.fn(),
    CacheRepository: vi.fn().mockImplementation(() => mockCache),
    sql:      {},
    adminSql: {},
  }
})

// Mock config + oauth to prevent env var validation on import
vi.mock('../../config.js', () => ({
  config: {
    ENCRYPTION_KEY: '0'.repeat(64),
    JWT_SECRET: 'test-secret-that-is-at-least-32-chars',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}))

vi.mock('../../lib/oauth.js', () => ({
  google: { getAuthUrl: vi.fn(), exchangeCode: vi.fn(), getProfile: vi.fn() },
  github: { getAuthUrl: vi.fn(), exchangeCode: vi.fn(), getProfile: vi.fn() },
}))

vi.mock('../../lib/crypto.js', () => ({
  encrypt: vi.fn().mockReturnValue('encrypted'),
}))

vi.mock('../../lib/permissions.js', () => ({
  buildPermissions: vi.fn().mockReturnValue([]),
}))

import { AuthService } from '../../services/auth.service.js'
import { ApiKeyService } from '../../services/api-key.service.js'
import { auditMeta } from '../../lib/audit-helpers.js'
import type { RequestContext } from '../../types.js'

const logger = pino({ level: 'silent' })

// ── auditMeta utility ───────────────────────────────────────────────────────

describe('auditMeta()', () => {
  it('returns empty object when not impersonating', () => {
    const ctx: RequestContext = {
      userId: 'u-1', sessionId: 's-1', tenantId: 't-1',
      role: 'admin', planId: 'p-1', planSlug: 'starter', isPlatformAdmin: false,
    }
    expect(auditMeta(ctx)).toEqual({})
  })

  it('returns impersonatedBy when impersonating', () => {
    const ctx: RequestContext = {
      userId: 'u-target', sessionId: 's-imp', tenantId: 't-1',
      role: 'member', planId: 'p-1', planSlug: 'starter', isPlatformAdmin: false,
      impersonatorId: 'u-admin',
    }
    expect(auditMeta(ctx)).toEqual({ impersonatedBy: 'u-admin' })
  })
})

// ── Token refresh preserves impersonation ────────────────────────────────────

describe('AuthService.rotateSession()', () => {
  let svc: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new AuthService(mockCache as never, logger)
  })

  it('preserves impersonatorId in the rotated session', async () => {
    const oldSessionData = {
      role: 'member' as const,
      planId: 'p-1',
      planSlug: 'starter',
      permissions: ['members:read', 'api-keys:read'],
      impersonatorId: 'u-admin',
      impersonatorSessionId: 's-admin',
    }

    mockRepos.sessions.findValidForUpdate.mockResolvedValueOnce({
      id: 's-imp-old', userId: 'u-target', tenantId: 't-1',
      data: oldSessionData, expiresAt: new Date(Date.now() + 3600_000),
    })
    mockRepos.sessions.deleteById.mockResolvedValueOnce(undefined)
    mockRepos.sessions.create.mockResolvedValueOnce({
      id: 's-imp-new', userId: 'u-target', tenantId: 't-1',
      data: oldSessionData,
    })

    const result = await svc.rotateSession('s-imp-old', 'u-target', {
      ipAddress: '127.0.0.1', userAgent: 'test',
    })

    expect(result.impersonatorId).toBe('u-admin')
    expect(result.sessionId).toBe('s-imp-new')
    expect(result.userId).toBe('u-target')
  })

  it('caps impersonation session TTL to 2 hours', async () => {
    const oldSessionData = {
      role: 'member' as const,
      planId: 'p-1',
      planSlug: 'starter',
      permissions: [],
      impersonatorId: 'u-admin',
      impersonatorSessionId: 's-admin',
    }

    mockRepos.sessions.findValidForUpdate.mockResolvedValueOnce({
      id: 's-imp-old', userId: 'u-target', tenantId: 't-1',
      data: oldSessionData, expiresAt: new Date(Date.now() + 3600_000),
    })
    mockRepos.sessions.deleteById.mockResolvedValueOnce(undefined)
    mockRepos.sessions.create.mockResolvedValueOnce({
      id: 's-imp-new', userId: 'u-target', tenantId: 't-1',
      data: oldSessionData,
    })

    await svc.rotateSession('s-imp-old', 'u-target', {
      ipAddress: '127.0.0.1', userAgent: 'test',
    })

    const createCall = mockRepos.sessions.create.mock.calls[0]![0]
    const expiresAt = createCall.expiresAt as Date
    const twoHoursMs = 2 * 60 * 60 * 1_000
    const diff = expiresAt.getTime() - Date.now()

    // Should be ~2h, not 7d
    expect(diff).toBeLessThanOrEqual(twoHoursMs + 1000)
    expect(diff).toBeGreaterThan(twoHoursMs - 5000)
  })

  it('uses 7-day TTL for normal (non-impersonation) sessions', async () => {
    const normalData = {
      role: 'admin' as const,
      planId: 'p-1',
      planSlug: 'starter',
      permissions: [],
    }

    mockRepos.sessions.findValidForUpdate.mockResolvedValueOnce({
      id: 's-old', userId: 'u-1', tenantId: 't-1',
      data: normalData, expiresAt: new Date(Date.now() + 86400_000),
    })
    mockRepos.sessions.deleteById.mockResolvedValueOnce(undefined)
    mockRepos.sessions.create.mockResolvedValueOnce({
      id: 's-new', userId: 'u-1', tenantId: 't-1', data: normalData,
    })

    const result = await svc.rotateSession('s-old', 'u-1', {
      ipAddress: '127.0.0.1', userAgent: 'test',
    })

    expect(result.impersonatorId).toBeUndefined()

    const createCall = mockRepos.sessions.create.mock.calls[0]![0]
    const expiresAt = createCall.expiresAt as Date
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1_000
    const diff = expiresAt.getTime() - Date.now()

    expect(diff).toBeGreaterThan(sevenDaysMs - 5000)
  })
})

// ── Audit metadata propagates during impersonation ──────────────────────────

describe('ApiKeyService with impersonation ctx', () => {
  let svc: ApiKeyService

  const impersonationCtx: RequestContext = {
    userId: 'u-target', sessionId: 's-imp', tenantId: 't-1',
    role: 'admin', planId: 'p-1', planSlug: 'starter', isPlatformAdmin: false,
    impersonatorId: 'u-admin',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.auditLogs.create.mockResolvedValue(undefined)
    svc = new ApiKeyService(logger)
  })

  it('includes impersonatedBy in audit metadata when creating a key', async () => {
    mockRepos.subscriptions.findByTenantId.mockResolvedValueOnce({
      plan: { limits: { maxApiKeys: 10 } },
    })
    mockRepos.apiKeys.countActive.mockResolvedValueOnce(1)
    mockRepos.apiKeys.create.mockResolvedValueOnce({
      id: 'key-1', tenantId: 't-1', createdBy: 'u-target',
      name: 'Test', prefix: 'sk_test', scopes: [],
      fullKey: 'sk_test_full',
    })

    await svc.create(impersonationCtx, { name: 'Test' })

    expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_keys.create',
        metadata: { impersonatedBy: 'u-admin' },
      }),
    )
  })

  it('includes impersonatedBy in audit metadata when revoking a key', async () => {
    mockRepos.apiKeys.findById.mockResolvedValueOnce({
      id: 'key-1', name: 'Production Key', prefix: 'sk_live_a1B2',
    })
    mockRepos.apiKeys.revoke.mockResolvedValueOnce(undefined)

    await svc.revoke(impersonationCtx, 'key-1')

    expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_keys.revoke',
        metadata: { impersonatedBy: 'u-admin' },
      }),
    )
  })

  it('does not include impersonatedBy for normal requests', async () => {
    const normalCtx: RequestContext = {
      userId: 'u-1', sessionId: 's-1', tenantId: 't-1',
      role: 'admin', planId: 'p-1', planSlug: 'starter', isPlatformAdmin: false,
    }

    mockRepos.apiKeys.findById.mockResolvedValueOnce({
      id: 'key-1', name: 'Key', prefix: 'sk_live',
    })
    mockRepos.apiKeys.revoke.mockResolvedValueOnce(undefined)

    await svc.revoke(normalCtx, 'key-1')

    expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_keys.revoke',
        metadata: {},
      }),
    )
  })
})
