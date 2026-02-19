import { setDbMetricsHooks } from '@saas/db'
import {
  dbTransactionDuration,
  dbTransactionTotal,
  SLOW_TRANSACTION_THRESHOLD_MS,
} from './metrics.js'
import type { BaseLogger } from 'pino'

export function initDbMetrics(logger: BaseLogger): void {
  setDbMetricsHooks({
    onTransactionComplete(type, durationMs) {
      dbTransactionDuration.observe({ type }, durationMs / 1000)
      dbTransactionTotal.inc({ type, status: 'ok' })

      if (durationMs > SLOW_TRANSACTION_THRESHOLD_MS) {
        logger.warn({ type, durationMs: Math.round(durationMs) }, 'Slow DB transaction')
      }
    },

    onTransactionError(type, durationMs) {
      dbTransactionDuration.observe({ type }, durationMs / 1000)
      dbTransactionTotal.inc({ type, status: 'error' })
    },
  })
}
