import type { Sql } from 'postgres'
import type { WebhookEndpoint, NewWebhookEndpoint, WebhookDelivery } from '../types.js'
import { NotFoundError } from '../errors.js'

// Excludes the write-only HMAC signing secret from standard queries.
type WebhookEndpointPublic = Omit<WebhookEndpoint, 'secret'>

const PUBLIC_COLUMNS = `id, tenant_id, url, events, is_active, created_at, updated_at`

export class WebhooksRepository {
  constructor(private readonly sql: Sql) {}

  async findAll(): Promise<WebhookEndpointPublic[]> {
    return this.sql<WebhookEndpointPublic[]>`
      SELECT ${this.sql.unsafe(PUBLIC_COLUMNS)} FROM webhook_endpoints ORDER BY created_at DESC
    `
  }

  async findById(id: string): Promise<WebhookEndpointPublic | null> {
    const rows = await this.sql<WebhookEndpointPublic[]>`
      SELECT ${this.sql.unsafe(PUBLIC_COLUMNS)} FROM webhook_endpoints WHERE id = ${id}
    `
    return rows[0] ?? null
  }

  async findByIdWithSecret(id: string): Promise<WebhookEndpoint | null> {
    const rows = await this.sql<WebhookEndpoint[]>`
      SELECT * FROM webhook_endpoints WHERE id = ${id}
    `
    return rows[0] ?? null
  }

  async create(data: NewWebhookEndpoint): Promise<WebhookEndpoint> {
    const rows = await this.sql<WebhookEndpoint[]>`
      INSERT INTO webhook_endpoints (tenant_id, url, events)
      VALUES (${data.tenantId}, ${data.url}, ${data.events ?? []})
      RETURNING *
    `
    return rows[0]!
  }

  async update(id: string, patch: { url?: string; events?: string[]; isActive?: boolean }): Promise<WebhookEndpoint> {
    const rows = await this.sql<WebhookEndpoint[]>`
      UPDATE webhook_endpoints
         SET ${this.sql(patch)}, updated_at = NOW()
       WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('WebhookEndpoint', id)
    return rows[0]
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM webhook_endpoints WHERE id = ${id}`
  }

  async findActiveByEvent(eventType: string): Promise<WebhookEndpoint[]> {
    return this.sql<WebhookEndpoint[]>`
      SELECT * FROM webhook_endpoints
      WHERE  is_active = true
        AND (events = '{}' OR ${eventType} = ANY(events))
    `
  }

  async logDelivery(data: {
    endpointId: string
    jobId?: string | null
    eventType: string
    payload: Record<string, unknown>
    statusCode?: number | null
    responseBody?: string | null
    durationMs?: number | null
    attempt?: number
    deliveredAt?: Date | null
  }): Promise<WebhookDelivery> {
    const rows = await this.sql<WebhookDelivery[]>`
      INSERT INTO webhook_deliveries (
        endpoint_id, job_id, event_type, payload,
        status_code, response_body, duration_ms, attempt, delivered_at
      ) VALUES (
        ${data.endpointId},
        ${data.jobId ?? null},
        ${data.eventType},
        ${this.sql.json(data.payload as unknown as Parameters<(typeof this.sql)['json']>[0])},
        ${data.statusCode ?? null},
        ${data.responseBody ?? null},
        ${data.durationMs ?? null},
        ${data.attempt ?? 1},
        ${data.deliveredAt ?? null}
      )
      RETURNING *
    `
    return rows[0]!
  }

  async listDeliveries(endpointId: string, limit = 25): Promise<WebhookDelivery[]> {
    return this.sql<WebhookDelivery[]>`
      SELECT * FROM webhook_deliveries
      WHERE  endpoint_id = ${endpointId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }
}
