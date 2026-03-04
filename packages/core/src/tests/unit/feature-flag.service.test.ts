import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

const { mockRepos } = vi.hoisted(() => ({
  mockRepos: {
    featureFlags: {
      resolve:              vi.fn(),
      resolveMany:          vi.fn(),
      listTenantOverrides:  vi.fn(),
      setTenantOverride:    vi.fn(),
      deleteTenantOverride: vi.fn(),
    },
    auditLogs: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@saas/db', () => {
  class ForbiddenError extends Error {
    override readonly name = 'ForbiddenError'
    constructor(msg: string) { super(msg) }
  }

  return {
    withTenant: (
      _opts: unknown,
      fn: (ctx: { repos: typeof mockRepos }) => Promise<unknown>,
    ) => fn({ repos: mockRepos }),
    ForbiddenError,
  }
})

import { FeatureFlagService } from '../../services/feature-flag.service.js'

const logger  = pino({ level: 'silent' })
const service = new FeatureFlagService(logger)

const ctx = (tenantId: string | null = 'tenant-1') => ({
  userId: 'user-1', sessionId: 'sess-1', tenantId, role: 'admin' as const, planId: 'plan-1', planSlug: 'growth', isPlatformAdmin: false,
})

const fakeFlag = () => ({
  id: 'flag-1', key: 'sso', scopeType: 'tenant' as const, scopeId: 'tenant-1',
  enabled: true, config: {}, createdAt: new Date(), updatedAt: new Date(),
})

describe('FeatureFlagService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.auditLogs.create.mockResolvedValue(undefined)
  })

  it('resolves a single flag for the current tenant + plan', async () => {
    const resolved = { key: 'sso', enabled: true, config: {} }
    mockRepos.featureFlags.resolve.mockResolvedValue(resolved)

    const result = await service.resolve(ctx(), 'sso')

    expect(mockRepos.featureFlags.resolve).toHaveBeenCalledWith('sso', 'tenant-1', 'plan-1')
    expect(result).toEqual(resolved)
  })

  it('throws ForbiddenError when no tenant is set', async () => {
    await expect(service.resolve(ctx(null), 'sso'))
      .rejects.toMatchObject({ name: 'ForbiddenError' })
  })

  it('batch-resolves multiple flags', async () => {
    const resolved = { sso: { key: 'sso', enabled: true, config: {} } }
    mockRepos.featureFlags.resolveMany.mockResolvedValue(resolved)

    const result = await service.resolveMany(ctx(), ['sso'])

    expect(mockRepos.featureFlags.resolveMany).toHaveBeenCalledWith(['sso'], 'tenant-1', 'plan-1')
    expect(result).toEqual(resolved)
  })

  it('lists tenant overrides', async () => {
    mockRepos.featureFlags.listTenantOverrides.mockResolvedValue([fakeFlag()])

    const result = await service.listOverrides(ctx())

    expect(mockRepos.featureFlags.listTenantOverrides).toHaveBeenCalledWith('tenant-1')
    expect(result).toHaveLength(1)
  })

  it('upserts a tenant override and writes an audit log', async () => {
    mockRepos.featureFlags.setTenantOverride.mockResolvedValue(fakeFlag())

    await service.setOverride(ctx(), 'sso', true, { maxSeats: 5 })

    expect(mockRepos.featureFlags.setTenantOverride).toHaveBeenCalledWith('sso', 'tenant-1', true, { maxSeats: 5 })
    expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'feature_flags.set', resourceId: 'sso' }),
    )
  })


  it('deletes a tenant override and writes an audit log', async () => {
    mockRepos.featureFlags.deleteTenantOverride.mockResolvedValue(undefined)

    await service.deleteOverride(ctx(), 'sso')

    expect(mockRepos.featureFlags.deleteTenantOverride).toHaveBeenCalledWith('sso', 'tenant-1')
    expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'feature_flags.delete', resourceId: 'sso' }),
    )
  })
})
