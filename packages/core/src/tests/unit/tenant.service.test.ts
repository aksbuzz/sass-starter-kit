import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

const { mockRepos } = vi.hoisted(() => ({
  mockRepos: {
    tenants: {
      findBySlug:      vi.fn(),
      create:          vi.fn(),
      findByIdOrThrow: vi.fn(),
      update:          vi.fn(),
      softDelete:      vi.fn(),
    },
    users: {
      findByEmail: vi.fn(),
    },
    memberships: {
      create:             vi.fn(),
      findTenantsForUser: vi.fn(),
      findById:           vi.fn(),
      countActive:        vi.fn(),
      countByRole:           vi.fn(),
      countByRoleForUpdate:  vi.fn(),
      updateRole:         vi.fn(),
      delete:             vi.fn(),
    },
    plans: {
      findBySlug: vi.fn(),
    },
    subscriptions: {
      create:         vi.fn(),
      findByTenantId: vi.fn(),
    },
    sessions: {
      deleteByUserAndTenant: vi.fn(),
    },
    jobs: {
      enqueue: vi.fn(),
    },
    auditLogs: {
      create: vi.fn(),
    },
    invitations: {
      create:             vi.fn(),
      findByTokenOrThrow: vi.fn(),
      accept:             vi.fn(),
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
  class ConflictError extends Error {
    readonly code = 'CONFLICT'
    constructor(message: string) {
      super(message)
      this.name = 'ConflictError'
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
    ConflictError,
    ForbiddenError,
    PlanLimitError,
    withTenant: (_opts: unknown, fn: (ctx: { repos: typeof mockRepos }) => Promise<unknown>) =>
      fn({ repos: mockRepos }),
    withAdmin: (fn: (ctx: { repos: typeof mockRepos }) => Promise<unknown>) =>
      fn({ repos: mockRepos }),
    sql:      {},
    adminSql: {},
  }
})

import { TenantService } from '../../services/tenant.service.js'
import type { RequestContext } from '../../types.js'


const logger = pino({ level: 'silent' })

const fakeTenant = {
  id: 'tenant-1', name: 'Acme Corp', slug: 'acme', status: 'trialing',
  settings: {}, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
}

const fakeStarterPlan = {
  id: 'plan-starter', slug: 'starter', name: 'Starter',
  limits: { maxMembers: 5, maxApiKeys: 10 },
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
}

const fakeMembership = (role = 'owner', userId = 'user-1') => ({
  id: 'mem-1', tenantId: 'tenant-1', userId, role,
  status: 'active', joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
})

const ctx: RequestContext = {
  userId: 'user-1', tenantId: 'tenant-1', sessionId: 'sess-1',
  role: 'owner', planId: 'plan-starter', planSlug: 'starter', isPlatformAdmin: false,
}

describe('TenantService', () => {
  let svc: TenantService

  beforeEach(() => {
    vi.clearAllMocks()
    // Default no-op for audit logs so tests that don't care don't need to set it up
    mockRepos.auditLogs.create.mockResolvedValue(undefined)
    svc = new TenantService(logger)
  })

  describe('create()', () => {
    it('throws ConflictError when the slug is already taken', async () => {
      mockRepos.tenants.findBySlug.mockResolvedValueOnce(fakeTenant)

      await expect(svc.create('user-1', { name: 'Acme Corp' }))
        .rejects.toMatchObject({ name: 'ConflictError' })
    })

    it('creates tenant, owner membership, and trial subscription in one transaction', async () => {
      mockRepos.tenants.findBySlug.mockResolvedValueOnce(null)
      mockRepos.tenants.create.mockResolvedValueOnce(fakeTenant)
      mockRepos.memberships.create.mockResolvedValueOnce(fakeMembership())
      mockRepos.plans.findBySlug.mockResolvedValueOnce(fakeStarterPlan)
      mockRepos.subscriptions.create.mockResolvedValueOnce(undefined)

      const result = await svc.create('user-1', { name: 'Acme Corp' })

      expect(result.tenant.id).toBe('tenant-1')
      expect(result.membership.role).toBe('owner')
      expect(mockRepos.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'plan-starter', status: 'trialing' }),
      )
    })

    it('throws when the starter plan seed is missing from the DB', async () => {
      mockRepos.tenants.findBySlug.mockResolvedValueOnce(null)
      mockRepos.tenants.create.mockResolvedValueOnce(fakeTenant)
      mockRepos.memberships.create.mockResolvedValueOnce(fakeMembership())
      mockRepos.plans.findBySlug.mockResolvedValueOnce(null) // missing

      await expect(svc.create('user-1', { name: 'Acme Corp' }))
        .rejects.toThrow('Starter plan missing')
    })
  })

})
