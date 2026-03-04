import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

const { mockRepos } = vi.hoisted(() => ({
  mockRepos: {
    subscriptions: {
      findByTenantId: vi.fn(),
    },
    apiKeys: {
      countActive:    vi.fn(),
      create:         vi.fn(),
      findById:       vi.fn(),
      findByTenantId: vi.fn(),
      revoke:         vi.fn(),
    },
    auditLogs: {
      create: vi.fn(),
    },
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
    withTenant: (_opts: unknown, fn: (ctx: { repos: typeof mockRepos }) => Promise<unknown>) =>
      fn({ repos: mockRepos }),
    sql:      {},
    adminSql: {},
  }
})

import { ApiKeyService } from '../../services/api-key.service.js'
import type { RequestContext } from '../../types.js'

const logger = pino({ level: 'silent' })

const ctx: RequestContext = {
  userId: 'user-1', tenantId: 'tenant-1', sessionId: 'sess-1',
  role: 'admin', planId: 'plan-starter', planSlug: 'starter', isPlatformAdmin: false,
}

const fakeKey = {
  id: 'key-1', tenantId: 'tenant-1', createdBy: 'user-1',
  name: 'Production Key', prefix: 'sk_live_a1B2',
  scopes: [], lastUsedAt: null, expiresAt: null, revokedAt: null,
  createdAt: new Date(),
}

describe('ApiKeyService', () => {
  let svc: ApiKeyService

  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.auditLogs.create.mockResolvedValue(undefined)
    svc = new ApiKeyService(logger)
  })

  describe('create()', () => {
    it('throws PlanLimitError when the tenant is at its key limit', async () => {
      mockRepos.subscriptions.findByTenantId.mockResolvedValueOnce({
        plan: { limits: { maxApiKeys: 10 } },
      })
      mockRepos.apiKeys.countActive.mockResolvedValueOnce(10)

      await expect(svc.create(ctx, { name: 'New Key' }))
        .rejects.toMatchObject({ name: 'PlanLimitError' })

      // Key creation must not proceed after a limit error
      expect(mockRepos.apiKeys.create).not.toHaveBeenCalled()
    })

    it('creates a key and writes an audit log entry on success', async () => {
      mockRepos.subscriptions.findByTenantId.mockResolvedValueOnce({
        plan: { limits: { maxApiKeys: 10 } },
      })
      mockRepos.apiKeys.countActive.mockResolvedValueOnce(3)
      mockRepos.apiKeys.create.mockResolvedValueOnce({ ...fakeKey, fullKey: 'sk_live_abc123' })

      const result = await svc.create(ctx, { name: 'Production Key' })

      expect(result.fullKey).toBe('sk_live_abc123')
      expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'api_keys.create', resourceId: 'key-1' }),
      )
    })
  })

  describe('revoke()', () => {
    it('throws NotFoundError when the key does not belong to the tenant', async () => {
      mockRepos.apiKeys.findById.mockResolvedValueOnce(null)

      await expect(svc.revoke(ctx, 'nonexistent-key'))
        .rejects.toMatchObject({ name: 'NotFoundError' })

      expect(mockRepos.apiKeys.revoke).not.toHaveBeenCalled()
    })

    it('revokes the key and records name + prefix in the audit log', async () => {
      mockRepos.apiKeys.findById.mockResolvedValueOnce(fakeKey)
      mockRepos.apiKeys.revoke.mockResolvedValueOnce(undefined)

      await svc.revoke(ctx, 'key-1')

      expect(mockRepos.apiKeys.revoke).toHaveBeenCalledWith('key-1')
      expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'api_keys.revoke',
          resourceId: 'key-1',
          before: { name: 'Production Key', prefix: 'sk_live_a1B2' },
        }),
      )
    })
  })
})
