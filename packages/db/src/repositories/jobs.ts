import type { Sql } from 'postgres'
import type { Job, NewJob, JobStatus } from '../types.js'

export class JobsRepository {
  constructor(private readonly sql: Sql) {}

  async enqueue(data: NewJob): Promise<Job> {
    const rows = await this.sql<Job[]>`
      INSERT INTO jobs (queue, type, payload, priority, max_attempts, run_at)
      VALUES (
        ${data.queue      ?? 'default'},
        ${data.type},
        ${this.sql.json(data.payload as unknown as Parameters<(typeof this.sql)['json']>[0])},
        ${data.priority   ?? 0},
        ${data.maxAttempts ?? 3},
        ${data.runAt      ?? new Date()}
      )
      RETURNING *
    `
    return rows[0]!
  }

  async enqueueBatch(jobs: NewJob[]): Promise<Job[]> {
    if (jobs.length === 0) return []
    return this.sql<Job[]>`
      INSERT INTO jobs ${this.sql(
        jobs.map((j) => ({
          queue:       j.queue       ?? 'default',
          type:        j.type,
          payload:     this.sql.json(j.payload as unknown as Parameters<(typeof this.sql)['json']>[0]),
          priority:    j.priority    ?? 0,
          maxAttempts: j.maxAttempts ?? 3,
          runAt:       j.runAt       ?? new Date(),
        })),
        'queue', 'type', 'payload', 'priority', 'maxAttempts', 'runAt'
      ) as any}
      RETURNING *
    `
  }


  async claim(queue: string, limit = 1): Promise<Job[]> {
    return this.sql<Job[]>`
      WITH claimed AS (
        SELECT id FROM jobs
        WHERE  queue  = ${queue}
          AND  status = 'pending'
          AND  run_at <= NOW()
        ORDER BY priority DESC, run_at ASC
        LIMIT  ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE jobs
         SET status     = 'processing',
             started_at = NOW(),
             attempts   = attempts + 1,
             updated_at = NOW()
        FROM claimed
       WHERE jobs.id = claimed.id
      RETURNING jobs.*
    `
  }

  async complete(id: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE jobs
         SET status       = 'completed',
             completed_at = NOW(),
             updated_at   = NOW()
       WHERE id = ${id}
         AND status = 'processing'
    `
    return result.count > 0
  }

  async fail(id: string, error: { message: string; stack?: string | undefined }): Promise<Job | null> {
    const rows = await this.sql<Job[]>`
      UPDATE jobs
         SET status     = 'failed',
             error      = jsonb_build_object(
                            'message', ${error.message}::text,
                            'stack',   ${error.stack ?? ''}::text,
                            'attempt', attempts
                          ),
             updated_at = NOW()
       WHERE id = ${id}
         AND status = 'processing'
      RETURNING *
    `
    return rows[0] ?? null
  }

  async cancel(id: string): Promise<void> {
    await this.sql`
      UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = ${id}
    `
  }

  async findById(id: string): Promise<Job | null> {
    const rows = await this.sql<Job[]>`SELECT * FROM jobs WHERE id = ${id}`
    return rows[0] ?? null
  }

  async listByStatus(status: JobStatus, queue?: string, limit = 50): Promise<Job[]> {
    return this.sql<Job[]>`
      SELECT * FROM jobs
      WHERE  status = ${status}
        AND  ${queue ? this.sql`queue = ${queue}` : this.sql`TRUE`}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }
}
