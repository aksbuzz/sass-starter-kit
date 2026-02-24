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
  role: 'owner', planId: 'plan-starter', planSlug: 'starter',
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

  describe('inviteMember()', () => {
    it('throws PlanLimitError when member count is at the plan cap', async () => {
      mockRepos.subscriptions.findByTenantId.mockResolvedValueOnce({
        plan: { limits: { maxMembers: 3 } },
      })
      mockRepos.memberships.countActive.mockResolvedValueOnce(3)

      await expect(svc.inviteMember(ctx, { email: 'new@example.com', role: 'member' }))
        .rejects.toMatchObject({ name: 'PlanLimitError' })
    })

    it('throws ConflictError when the invitee is already an active member', async () => {
      mockRepos.subscriptions.findByTenantId.mockResolvedValueOnce({
        plan: { limits: { maxMembers: null } }, // unlimited
      })
      mockRepos.memberships.countActive.mockResolvedValueOnce(2)
      // User found AND already has an active membership in this tenant
      mockRepos.users.findByEmail.mockResolvedValueOnce({ id: 'existing-user' })
      mockRepos.memberships.findTenantsForUser.mockResolvedValueOnce([
        { tenantId: 'tenant-1', status: 'active', role: 'member' },
      ])

      await expect(svc.inviteMember(ctx, { email: 'existing@example.com', role: 'member' }))
        .rejects.toMatchObject({ name: 'ConflictError' })
    })

    it('creates an invitation and enqueues an email job for a new user', async () => {
      mockRepos.subscriptions.findByTenantId.mockResolvedValueOnce(null) // no limits
      mockRepos.memberships.countActive.mockResolvedValueOnce(2)
      mockRepos.users.findByEmail.mockResolvedValueOnce(null) // new user, never signed up
      mockRepos.invitations.create.mockResolvedValueOnce({
        id: 'inv-1', tenantId: 'tenant-1', email: 'new@example.com', role: 'member',
      })
      mockRepos.jobs.enqueue.mockResolvedValueOnce({ id: 'job-1' })

      const result = await svc.inviteMember(ctx, { email: 'new@example.com', role: 'member' })

      expect(result.id).toBe('inv-1')
      expect(mockRepos.jobs.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'invitation.send', queue: 'email' }),
      )
    })
  })

  describe('updateMemberRole()', () => {
    it('throws ConflictError when downgrading the last remaining owner', async () => {
      mockRepos.memberships.findById.mockResolvedValueOnce(fakeMembership('owner'))
      mockRepos.memberships.countByRoleForUpdate.mockResolvedValueOnce(1)

      await expect(svc.updateMemberRole(ctx, 'mem-1', 'admin'))
        .rejects.toMatchObject({ name: 'ConflictError' })
    })

    it('completes a role change when multiple owners exist', async () => {
      mockRepos.memberships.findById.mockResolvedValueOnce(fakeMembership('owner'))
      mockRepos.memberships.countByRoleForUpdate.mockResolvedValueOnce(2)
      mockRepos.memberships.updateRole.mockResolvedValueOnce({ ...fakeMembership('owner'), role: 'admin' })
      mockRepos.sessions.deleteByUserAndTenant.mockResolvedValueOnce(undefined)

      const result = await svc.updateMemberRole(ctx, 'mem-1', 'admin')

      expect(result.role).toBe('admin')
      // Session invalidation: user must re-login with new role
      expect(mockRepos.sessions.deleteByUserAndTenant).toHaveBeenCalledWith('user-1', 'tenant-1')
    })

    it('does not check owner count when promoting (non-owner → owner)', async () => {
      mockRepos.memberships.findById.mockResolvedValueOnce(fakeMembership('member'))
      mockRepos.memberships.updateRole.mockResolvedValueOnce({ ...fakeMembership('member'), role: 'owner' })
      mockRepos.sessions.deleteByUserAndTenant.mockResolvedValueOnce(undefined)

      await svc.updateMemberRole(ctx, 'mem-1', 'owner')

      expect(mockRepos.memberships.countByRoleForUpdate).not.toHaveBeenCalled()
    })
  })

  describe('removeMember()', () => {
    it('throws ConflictError when removing the last owner', async () => {
      mockRepos.memberships.findById.mockResolvedValueOnce(fakeMembership('owner'))
      mockRepos.memberships.countByRoleForUpdate.mockResolvedValueOnce(1)

      await expect(svc.removeMember(ctx, 'mem-1'))
        .rejects.toMatchObject({ name: 'ConflictError' })
    })

    it('removes a non-owner member without checking owner count', async () => {
      mockRepos.memberships.findById.mockResolvedValueOnce(fakeMembership('member'))
      mockRepos.sessions.deleteByUserAndTenant.mockResolvedValueOnce(undefined)
      mockRepos.memberships.delete.mockResolvedValueOnce(undefined)

      await svc.removeMember(ctx, 'mem-1')

      expect(mockRepos.memberships.countByRoleForUpdate).not.toHaveBeenCalled()
      expect(mockRepos.memberships.delete).toHaveBeenCalledWith('mem-1')
    })
  })
})
