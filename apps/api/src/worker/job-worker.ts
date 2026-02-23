import { withAdmin } from '@saas/db'
import type { Job, JobPayload }  from '@saas/db'
import pino                      from 'pino'
import { notify }                from '../lib/notify.js'
import {
  jobProcessedTotal,
  jobProcessingDuration,
  jobActiveCount,
} from '../lib/metrics.js'


export type JobHandler<T extends JobPayload = JobPayload> = (
  job: Job & { payload: T },
  logger: pino.Logger,
) => Promise<void>

export type HandlerRegistry = {
  [K in JobPayload['type']]?: JobHandler<Extract<JobPayload, { type: K }>>
}

export interface JobWorkerOptions {
  queue:       string
  handlers:    HandlerRegistry
  logger:      pino.Logger
  concurrency?: number   // max jobs processed per tick (default: 5)
  pollMs?:      number   // ms between polls when queue is empty (default: 5000)
}

export class JobWorker {
  private readonly queue:       string
  private readonly handlers:    HandlerRegistry
  private readonly logger:      pino.Logger
  private readonly concurrency: number
  private readonly pollMs:      number

  private running  = false
  private timer:   ReturnType<typeof setTimeout> | null = null
  private readonly inflight = new Set<Promise<void>>()

  constructor(opts: JobWorkerOptions) {
    this.queue       = opts.queue
    this.handlers    = opts.handlers
    this.logger      = opts.logger.child({ component: 'job-worker', queue: opts.queue })
    this.concurrency = opts.concurrency ?? 5
    this.pollMs      = opts.pollMs      ?? 5_000
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.logger.info('Job worker started')
    void this.poll()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await Promise.allSettled([...this.inflight])
    this.logger.info('Job worker stopped')
  }

  private async poll(): Promise<void> {
    if (!this.running) return

    let jobsProcessed = 0
    try {
      const jobs = await withAdmin(({ repos }) =>
        repos.jobs.claim(this.queue, this.concurrency),
      )

      if (jobs.length > 0) {
        jobsProcessed = jobs.length
        for (const job of jobs) {
          const p = this.process(job)
          this.inflight.add(p)
          void p.finally(() => this.inflight.delete(p))
        }
        await Promise.all([...this.inflight])
      }
    } catch (err) {
      void notify(
        {
          level:   'error',
          message: 'Job worker poll cycle error',
          error:   err instanceof Error ? err : new Error(String(err)),
          context: { queue: this.queue },
        },
        this.logger,
      )
    }

    if (!this.running) return

    // If we filled the concurrency slot, poll immediately — there may be more work.
    // Otherwise wait the full interval.
    const delay = jobsProcessed >= this.concurrency ? 0 : this.pollMs
    this.timer  = setTimeout(() => void this.poll(), delay)
  }


  private async process(job: Job): Promise<void> {
    const jobLog = this.logger.child({ jobId: job.id, jobType: job.type, attempt: job.attempts })
    jobLog.info('Processing job')

    const handler = this.handlers[job.payload.type as JobPayload['type']] as
      JobHandler | undefined

    if (!handler) {
      jobLog.warn('No handler registered for job type — marking failed')
      await withAdmin(({ repos }) => repos.jobs.fail(job.id, {
        message: `No handler registered for job type: ${job.payload.type}`,
      }))
      jobProcessedTotal.inc({ queue: this.queue, type: job.type, status: 'failed' })
      return
    }

    jobActiveCount.inc({ queue: this.queue })
    const timerEnd = jobProcessingDuration.startTimer({ queue: this.queue, type: job.type })

    // Block 1: handler execution — failure here means the side effect did NOT happen
    try {
      await handler(job as Job & { payload: JobPayload }, jobLog)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const stack   = err instanceof Error ? err.stack   : undefined
      jobLog.error({ err }, 'Job failed')
      try {
        await withAdmin(({ repos }) => repos.jobs.fail(job.id, { message, stack }))
      } catch (failErr) {
        jobLog.error({ failErr }, 'Failed to mark job as failed in DB')
      }
      timerEnd()
      jobActiveCount.dec({ queue: this.queue })
      jobProcessedTotal.inc({ queue: this.queue, type: job.type, status: 'failed' })
      return
    }

    // Block 2: mark complete — handler succeeded, side effect already happened
    // Do NOT call fail() here: the handler ran successfully; retrying would duplicate the effect.
    try {
      const marked = await withAdmin(({ repos }) => repos.jobs.complete(job.id))
      if (marked) {
        jobLog.info('Job completed')
      } else {
        jobLog.warn('Job was no longer in processing state — possibly recovered by pg_cron')
      }
    } catch (completeErr) {
      jobLog.error({ completeErr }, 'Handler succeeded but failed to mark job complete in DB')
    }
    timerEnd()
    jobActiveCount.dec({ queue: this.queue })
    jobProcessedTotal.inc({ queue: this.queue, type: job.type, status: 'completed' })
  }
}
