import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

export const registry = new Registry()

collectDefaultMetrics({ register: registry, prefix: 'saas_' })

// ── HTTP ──────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name: 'saas_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
})

export const httpRequestsTotal = new Counter({
  name: 'saas_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
})

export const httpActiveRequests = new Gauge({
  name: 'saas_http_active_requests',
  help: 'Number of in-flight HTTP requests',
  labelNames: ['method'] as const,
  registers: [registry],
})

// ── Database ──────────────────────────────────────────────────────

export const dbTransactionDuration = new Histogram({
  name: 'saas_db_transaction_duration_seconds',
  help: 'Database transaction duration in seconds (withTenant / withAdmin)',
  labelNames: ['type'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
})

export const dbTransactionTotal = new Counter({
  name: 'saas_db_transaction_total',
  help: 'Total database transactions',
  labelNames: ['type', 'status'] as const,
  registers: [registry],
})

// ── Jobs ──────────────────────────────────────────────────────────

export const jobProcessedTotal = new Counter({
  name: 'saas_job_processed_total',
  help: 'Total jobs processed',
  labelNames: ['queue', 'type', 'status'] as const,
  registers: [registry],
})

export const jobProcessingDuration = new Histogram({
  name: 'saas_job_processing_duration_seconds',
  help: 'Job handler execution duration in seconds',
  labelNames: ['queue', 'type'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [registry],
})

export const jobActiveCount = new Gauge({
  name: 'saas_job_active_count',
  help: 'Number of currently in-flight jobs',
  labelNames: ['queue'] as const,
  registers: [registry],
})

// ── Thresholds ────────────────────────────────────────────────────

export const SLOW_TRANSACTION_THRESHOLD_MS = 500
