import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

const { mockFindByIdOrThrow, mockAdminSql } = vi.hoisted(() => ({
  mockFindByIdOrThrow: vi.fn(),
  mockAdminSql: Object.assign(
    vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) =>
      Promise.resolve([{ id: 'log-1' }, { id: 'log-2' }]),
    ),
    { begin: vi.fn() },
  ),
}))

vi.mock('@saas/db', () => ({
  withAdmin: (fn: (ctx: { repos: { tenants: { findByIdOrThrow: typeof mockFindByIdOrThrow } } }) => Promise<unknown>) =>
    fn({ repos: { tenants: { findByIdOrThrow: mockFindByIdOrThrow } } }),
  adminSql: mockAdminSql,
}))

import { handleArchiveAuditLogs } from '../../worker/handlers/archive-audit-logs.js'

const logger = pino({ level: 'silent' })

const fakeTenant = () => ({
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  slug: 'acme', name: 'Acme', isolationMode: 'rls' as const, schemaName: null,
  status: 'active', settings: {}, metadata: {}, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
})

const fakeJob = (tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', beforeDate = '2026-01-01T00:00:00Z') => ({
  id: 'job-1', queue: 'default', type: 'tenant.archive-audit-logs',
  payload: { type: 'tenant.archive-audit-logs' as const, tenantId, beforeDate },
  status: 'processing' as const, priority: 0, attempts: 1, maxAttempts: 3,
  runAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
})

describe('handleArchiveAuditLogs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes audit logs before the cutoff date and logs the count', async () => {
    mockFindByIdOrThrow.mockResolvedValue(fakeTenant())

    await handleArchiveAuditLogs(fakeJob() as never, logger)

    expect(mockFindByIdOrThrow).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890')

    expect(mockAdminSql).toHaveBeenCalledOnce()
    const [strings] = mockAdminSql.mock.calls[0] as [TemplateStringsArray]
    expect(strings.join('')).toContain('DELETE FROM audit_logs')
  })

  it('throws for an invalid beforeDate', async () => {
    mockFindByIdOrThrow.mockResolvedValue(fakeTenant())

    await expect(
      handleArchiveAuditLogs(fakeJob('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'not-a-date') as never, logger),
    ).rejects.toThrow('Invalid beforeDate')

    expect(mockAdminSql).not.toHaveBeenCalled()
  })

  it('propagates NotFoundError when the tenant does not exist', async () => {
    const err = Object.assign(new Error('not found'), { name: 'NotFoundError' })
    mockFindByIdOrThrow.mockRejectedValue(err)

    await expect(
      handleArchiveAuditLogs(fakeJob() as never, logger),
    ).rejects.toMatchObject({ name: 'NotFoundError' })

    expect(mockAdminSql).not.toHaveBeenCalled()
  })
})
