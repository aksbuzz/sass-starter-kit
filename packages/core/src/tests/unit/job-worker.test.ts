import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import pino from 'pino'

const { mockRepos } = vi.hoisted(() => ({
  mockRepos: {
    jobs: {
      claim:    vi.fn(),
      complete: vi.fn(),
      fail:     vi.fn(),
    },
  },
}))

vi.mock('@saas/db', () => ({
  withAdmin: (fn: (ctx: { repos: typeof mockRepos }) => Promise<unknown>) =>
    fn({ repos: mockRepos }),
  adminSql: {},
  sql:      {},
}))

vi.mock('../../lib/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))

import { JobWorker } from '../../worker/job-worker.js'


const logger = pino({ level: 'silent' })

const fakeJob = (type = 'email.send', id = 'job-1') => ({
  id,
  queue:       'email',
  type,
  payload:     { type } as unknown,
  status:      'processing',
  priority:    0,
  attempts:    1,
  maxAttempts: 3,
  runAt:       new Date(),
  createdAt:   new Date(),
  updatedAt:   new Date(),
})


async function waitForOnePollCycle(ms = 50): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
describe('JobWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.jobs.complete.mockResolvedValue(true)
    mockRepos.jobs.fail.mockResolvedValue(null)
  })

  afterEach(async () => {
    // No-op: each test stops its own worker
  })


  it('calls complete() after the handler resolves', async () => {
    const job     = fakeJob('email.send')
    const handler = vi.fn().mockResolvedValueOnce(undefined)

    mockRepos.jobs.claim.mockResolvedValueOnce([job]).mockResolvedValue([])

    const worker = new JobWorker({
      queue:    'email',
      handlers: { 'email.send': handler as never },
      logger,
      pollMs:   10_000, // prevent second poll from firing during test
    })

    worker.start()
    await waitForOnePollCycle()
    await worker.stop()

    expect(handler).toHaveBeenCalledWith(job, expect.any(Object))
    expect(mockRepos.jobs.complete).toHaveBeenCalledWith('job-1')
    expect(mockRepos.jobs.fail).not.toHaveBeenCalled()
  })


  it('calls fail() with the error message when the handler throws', async () => {
    const job     = fakeJob('email.send')
    const handler = vi.fn().mockRejectedValueOnce(new Error('SMTP connection refused'))

    mockRepos.jobs.claim.mockResolvedValueOnce([job]).mockResolvedValue([])

    const worker = new JobWorker({
      queue:    'email',
      handlers: { 'email.send': handler as never },
      logger,
      pollMs:   10_000,
    })

    worker.start()
    await waitForOnePollCycle()
    await worker.stop()

    expect(mockRepos.jobs.fail).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ message: 'SMTP connection refused' }),
    )
    expect(mockRepos.jobs.complete).not.toHaveBeenCalled()
  })


  it('marks the job as failed when no handler is registered for its type', async () => {
    const job = fakeJob('unknown.type')
    mockRepos.jobs.claim.mockResolvedValueOnce([job]).mockResolvedValue([])

    const worker = new JobWorker({
      queue:    'email',
      handlers: {}, // intentionally empty
      logger,
      pollMs:   10_000,
    })

    worker.start()
    await waitForOnePollCycle()
    await worker.stop()

    expect(mockRepos.jobs.fail).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ message: expect.stringContaining('No handler registered') }),
    )
  })


  it('processes all claimed jobs concurrently within a single tick', async () => {
    const jobs    = [fakeJob('email.send', 'job-1'), fakeJob('email.send', 'job-2'), fakeJob('email.send', 'job-3')]
    const handler = vi.fn().mockResolvedValue(undefined)

    mockRepos.jobs.claim.mockResolvedValueOnce(jobs).mockResolvedValue([])

    const worker = new JobWorker({
      queue:       'email',
      handlers:    { 'email.send': handler as never },
      logger,
      concurrency: 5,
      pollMs:      10_000,
    })

    worker.start()
    await waitForOnePollCycle()
    await worker.stop()

    expect(handler).toHaveBeenCalledTimes(3)
    expect(mockRepos.jobs.complete).toHaveBeenCalledTimes(3)
  })
})
