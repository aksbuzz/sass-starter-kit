import type { FastifyInstance } from 'fastify'
import { adminSql }              from '@saas/db'
import { authRoutes }            from './auth/index.js'
import { tenantsRoutes }         from './tenants/index.js'
import { billingRoutes }         from './billing/index.js'
import { apiKeyRoutes }          from './api-keys/index.js'
import { webhookRoutes }         from './webhooks/index.js'
import { featureFlagRoutes }     from './feature-flags/index.js'
import { auditLogRoutes }        from './audit-logs/index.js'


export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id)
  })

  fastify.get('/health', {
    schema: { tags: ['system'], summary: 'Liveness + readiness probe', hide: true },
    handler: async (_req, reply) => {
      try {
        await adminSql`SELECT 1`
        return { status: 'ok', timestamp: new Date().toISOString() }
      } catch (err) {
        fastify.log.error({ err }, 'Health check DB ping failed')
        return reply.code(503).send({
          status:    'error',
          timestamp: new Date().toISOString(),
          detail:    'database unreachable',
        })
      }
    },
  })

  await fastify.register(authRoutes)

  await fastify.register(async (app) => {
    await app.register(tenantsRoutes)
    await app.register(billingRoutes)
    await app.register(apiKeyRoutes)
    await app.register(webhookRoutes)
    await app.register(featureFlagRoutes)
    await app.register(auditLogRoutes)
  })
}
