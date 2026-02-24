import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

const { mockRepos } = vi.hoisted(() => ({
  mockRepos: {
    auditLogs: {
      findForTenant: vi.fn(),
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

import { AuditLogService } from '../../services/audit-log.service.js'

const logger  = pino({ level: 'silent' })
const service = new AuditLogService(logger)

const ctx = (tenantId: string | null = 'tenant-1') => ({
  userId: 'user-1', sessionId: 'sess-1', tenantId, role: 'admin' as const, planId: 'plan-1', planSlug: 'growth',
})

const fakeLog = () => ({
  id: 'log-1', tenantId: 'tenant-1', userId: 'user-1',
  action: 'api_keys.create', resourceType: 'ApiKey', resourceId: 'key-1',
  before: null, after: { name: 'My Key' }, metadata: {},
  createdAt: new Date(),
})

describe('AuditLogService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated logs from the repository', async () => {
    mockRepos.auditLogs.findForTenant.mockResolvedValue({ rows: [fakeLog()], total: 1 })

    const result = await service.list(ctx(), { limit: 10, offset: 0 })

    expect(mockRepos.auditLogs.findForTenant).toHaveBeenCalledWith({ limit: 10, offset: 0 })
    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('passes all filter parameters to the repository', async () => {
    mockRepos.auditLogs.findForTenant.mockResolvedValue({ rows: [], total: 0 })
    const from = new Date('2026-01-01')
    const to   = new Date('2026-02-01')

    await service.list(ctx(), { action: 'api_keys.create', resourceType: 'ApiKey', from, to })

    expect(mockRepos.auditLogs.findForTenant).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_keys.create', resourceType: 'ApiKey', from, to }),
    )
  })

  it('throws ForbiddenError when no tenant is set', async () => {
    await expect(service.list(ctx(null)))
      .rejects.toMatchObject({ name: 'ForbiddenError' })
  })
})
