import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  registry,
  httpRequestDuration,
  httpRequestsTotal,
  httpActiveRequests,
} from '../lib/metrics.js'

const EXCLUDED_ROUTES = new Set(['/metrics', '/health'])

export async function registerMetrics(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics', {
    schema: { hide: true } as Record<string, unknown>,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const metrics = await registry.metrics()
      return reply
        .header('Content-Type', registry.contentType)
        .send(metrics)
    },
  })

  fastify.decorateRequest('metricsStartTime', 0)

  fastify.addHook('onRequest', async (request) => {
    request.metricsStartTime = performance.now()
    httpActiveRequests.inc({ method: request.method })
  })

  fastify.addHook('onResponse', async (request, reply) => {
    httpActiveRequests.dec({ method: request.method })

    const route = request.routeOptions?.url ?? request.url
    if (EXCLUDED_ROUTES.has(route)) return

    const durationS = (performance.now() - request.metricsStartTime) / 1000
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    }

    httpRequestDuration.observe(labels, durationS)
    httpRequestsTotal.inc(labels)
  })
}
