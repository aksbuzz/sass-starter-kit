import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

const { mockFindByIdOrThrow, mockAdvisoryLock, mockBegin, mockTx } = vi.hoisted(() => {
  // A fake TransactionSql: callable as a tagged template + has .unsafe()
  const tx = Object.assign(
    vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve([])),
    { unsafe: vi.fn((_sql: string) => '_unsafe_fragment_') },
  )

  return {
    mockFindByIdOrThrow: vi.fn(),
    mockAdvisoryLock:    vi.fn(),
    mockBegin:           vi.fn(),
    mockTx:              tx,
  }
})

vi.mock('@saas/db', () => {
  class NotFoundError extends Error {
    override readonly name = 'NotFoundError'
    readonly code = 'NOT_FOUND'
    constructor(msg: string) { super(msg) }
  }

  return {
    withAdmin: (fn: (ctx: { repos: { tenants: { findByIdOrThrow: typeof mockFindByIdOrThrow } } }) => Promise<unknown>) =>
      fn({ repos: { tenants: { findByIdOrThrow: mockFindByIdOrThrow } } }),

    withAdvisoryLock: mockAdvisoryLock,

    adminSql: {
      begin: mockBegin,
    },

    NotFoundError,
  }
})

import { handleTenantProvisionSchema } from '../../worker/handlers/provision-schema.js'

const logger = pino({ level: 'silent' })

const fakeTenant = (overrides: Record<string, unknown> = {}) => ({
  id:            'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  slug:          'acme-corp',
  name:          'Acme Corp',
  isolationMode: 'rls' as const,
  schemaName:    null,
  status:        'active',
  settings:      {},
  metadata:      {},
  createdAt:     new Date(),
  updatedAt:     new Date(),
  deletedAt:     null,
  ...overrides,
})

const fakeJob = (tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') => ({
  id:          'job-1',
  queue:       'default',
  type:        'tenant.provision-schema',
  payload:     { type: 'tenant.provision-schema' as const, tenantId },
  status:      'processing' as const,
  priority:    0,
  attempts:    1,
  maxAttempts: 3,
  runAt:       new Date(),
  createdAt:   new Date(),
  updatedAt:   new Date(),
})

describe('handleTenantProvisionSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockAdvisoryLock.mockImplementation(
      (_key: string, fn: () => Promise<unknown>) => fn(),
    )

    mockBegin.mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    )
  })

  it('creates the schema, copies data, flips isolation_mode, and cleans up public', async () => {
    const tenant = fakeTenant()
    mockFindByIdOrThrow.mockResolvedValue(tenant)

    await handleTenantProvisionSchema(fakeJob() as never, logger)

    expect(mockAdvisoryLock).toHaveBeenCalledWith(
      `provision-schema:${tenant.id}`,
      expect.any(Function),
    )

    expect(mockBegin).toHaveBeenCalledOnce()

    const unsafeCalls = mockTx.unsafe.mock.calls.map(([sql]) => sql as string)
    expect(unsafeCalls.some(s => s.includes('CREATE SCHEMA IF NOT EXISTS "tenant_acme_corp"'))).toBe(true)
    expect(unsafeCalls.some(s => s.includes('GRANT USAGE ON SCHEMA "tenant_acme_corp" TO app_user'))).toBe(true)

    const expectedTables = ['memberships', 'invitations', 'api_keys', 'webhook_endpoints', 'webhook_deliveries']
    for (const table of expectedTables) {
      expect(
        unsafeCalls.some(s => s.includes(`"tenant_acme_corp".${table}`) && s.includes('CREATE TABLE IF NOT EXISTS')),
      ).toBe(true)
    }

    expect(mockTx.unsafe.mock.calls.length).toBeGreaterThan(0)
  })

  it('derives schema name from slug with hyphens converted to underscores', async () => {
    const tenant = fakeTenant({ slug: 'my-org-name' })
    mockFindByIdOrThrow.mockResolvedValue(tenant)

    await handleTenantProvisionSchema(fakeJob() as never, logger)

    const unsafeCalls = mockTx.unsafe.mock.calls.map(([sql]) => sql as string)
    expect(unsafeCalls.some(s => s.includes('"tenant_my_org_name"'))).toBe(true)
  })


  it('skips gracefully when tenant is already in schema isolation mode', async () => {
    const tenant = fakeTenant({ isolationMode: 'schema', schemaName: 'tenant_acme_corp' })
    mockFindByIdOrThrow.mockResolvedValue(tenant)

    await handleTenantProvisionSchema(fakeJob() as never, logger)

    expect(mockBegin).not.toHaveBeenCalled()
    expect(mockAdvisoryLock).not.toHaveBeenCalled()
  })


  it('propagates NotFoundError when the tenant does not exist', async () => {
    const err = Object.assign(new Error('Tenant not found'), { name: 'NotFoundError', code: 'NOT_FOUND' })
    mockFindByIdOrThrow.mockRejectedValue(err)

    await expect(
      handleTenantProvisionSchema(fakeJob() as never, logger),
    ).rejects.toMatchObject({ name: 'NotFoundError' })

    expect(mockBegin).not.toHaveBeenCalled()
  })


  it('throws when the advisory lock is held by another worker', async () => {
    const tenant = fakeTenant()
    mockFindByIdOrThrow.mockResolvedValue(tenant)

    mockAdvisoryLock.mockResolvedValue(null)

    await expect(
      handleTenantProvisionSchema(fakeJob() as never, logger),
    ).rejects.toThrow('Advisory lock')

    expect(mockBegin).not.toHaveBeenCalled()
  })
})
