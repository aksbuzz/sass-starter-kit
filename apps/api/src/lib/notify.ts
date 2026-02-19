import type { BaseLogger } from 'pino'
import { config }          from '../config.js'

export interface AlertPayload {
  level:    'error' | 'fatal'
  message:  string
  error?:   Error
  context?: Record<string, unknown>
}

/**
 * Central alerting hook (backendlore "notify" pattern).
 *
 * Always emits a structured log entry tagged with `alert: true` so log
 * aggregators (Datadog, Loki, CloudWatch) can filter on it.
 *
 * If ALERT_WEBHOOK_URL is set in the environment, also POSTs a JSON payload
 * to that URL. This is intentionally generic — it works with:
 *   • Slack incoming webhooks  (field `text` is rendered as the message)
 *   • Discord webhooks         (field `content` maps to `text` via adapter)
 *   • PagerDuty / OpsGenie    (custom routing rules on your receiver)
 *   • Any custom HTTP receiver
 *
 * Never throws: alerting must not crash the application.
 */
export async function notify(
  payload: AlertPayload,
  logger:  BaseLogger,
): Promise<void> {
  const logFields = {
    alert:   true,
    ...(payload.error ? {
      err: {
        name:    payload.error.name,
        message: payload.error.message,
        stack:   payload.error.stack,
      },
    } : {}),
    ...(payload.context ?? {}),
  }

  logger[payload.level](logFields, `[ALERT] ${payload.message}`)

  if (!config.ALERT_WEBHOOK_URL) return

  try {
    const res = await fetch(config.ALERT_WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        text:    `[${payload.level.toUpperCase()}] ${payload.message}`,
        ...logFields,
      }),
      signal: AbortSignal.timeout(5_000),
    })

    if (!res.ok) {
      logger.warn({ alert: true, status: res.status }, 'Alert webhook returned non-2xx')
    }
  } catch {
    // Never propagate — alerting failures must not affect request handling
    logger.warn({ alert: true }, 'Failed to deliver alert to webhook')
  }
}
