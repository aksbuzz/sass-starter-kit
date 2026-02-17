import { adminSql } from './client.js'

export const CHANNELS = {
  tenantEvents:      'saas:tenant_events',
  cacheInvalidation: 'saas:cache_invalidation',
  jobEnqueued:       'saas:job_enqueued',
} as const

export type Channel = typeof CHANNELS[keyof typeof CHANNELS]

export type PlatformEvent =
  | { type: 'tenant.created';          tenantId: string; slug: string }
  | { type: 'tenant.status_changed';   tenantId: string; status: string }
  | { type: 'subscription.upgraded';   tenantId: string; planSlug: string }
  | { type: 'subscription.canceled';   tenantId: string }
  | { type: 'member.invited';          tenantId: string; email: string }
  | { type: 'member.joined';           tenantId: string; userId: string }
  | { type: 'member.role_changed';     tenantId: string; userId: string; role: string }
  | { type: 'cache.invalidate';        tags: string[] }
  | { type: 'job.enqueued';            jobId: string; queue: string; jobType: string }

// Uses a short-lived adminSql connection (not the pool) via pg_notify.
export async function publish(channel: Channel, event: PlatformEvent): Promise<void> {
  await adminSql`SELECT pg_notify(${channel}, ${JSON.stringify(event)})`
}

export async function subscribe(
  channel: Channel,
  handler: (event: PlatformEvent) => void,
): Promise<() => Promise<void>> {
  const subscription = await adminSql.listen(
    channel,
    (rawPayload) => {
      try {
        const event = JSON.parse(rawPayload) as PlatformEvent
        handler(event)
      } catch {
        console.error(`[listen] Failed to parse payload on ${channel}:`, rawPayload)
      }
    },
  )
  return () => subscription.unlisten()
}
