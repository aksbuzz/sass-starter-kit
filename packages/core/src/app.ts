import Fastify, { type FastifyRequest, type FastifyReply, type FastifyError } from 'fastify'
import { adminSql }         from '@saas/db'
import { registerPlugins }  from './plugins/index.js'
import { config }           from './config.js'
import { authenticate }     from './hooks/authenticate.js'
import { notify }           from './lib/notify.js'
import { initDbMetrics }    from './lib/metrics-hooks.js'

/**
 * Shared Fastify factory used by both apps/api and apps/admin.
 * Sets up: logger, trustProxy, AJV, plugins, health check, error handler.
 * Callers register their own routes after calling this.
 */
export async function createBaseApp() {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV !== 'production'
        ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
        : {}),
    },
    trustProxy: config.NODE_ENV === 'production' ? 1 : true,
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes:      'array',
        useDefaults:      true,
      },
    },
    genReqId: () => crypto.randomUUID(),
  })

  // Initialize DB transaction metrics before any routes run.
  initDbMetrics(fastify.log as any)

  // Decorate request with null context before any routes run.
  fastify.decorateRequest('ctx', null)

  // Expose authenticate as a named hook on the fastify instance
  // so route files can reference it as fastify.authenticate
  fastify.decorate('authenticate', authenticate)

  await registerPlugins(fastify)

  // ── Shared hooks ────────────────────────────────────────────────────────
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id)
  })

  // Health check (always available)
  fastify.get('/health', {
    schema: { tags: ['system'], summary: 'Liveness + readiness probe', hide: true } as Record<string, unknown>,
    handler: async (_req: FastifyRequest, reply: FastifyReply) => {
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

  // ── Error handler ───────────────────────────────────────────────────────
  fastify.setErrorHandler(async (err: FastifyError, request, reply) => {
    const statusCode = err.statusCode ?? 500
    const isDev      = config.NODE_ENV !== 'production'

    if (statusCode >= 500) {
      await notify(
        {
          level:   'error',
          message: err.message,
          error:   err,
          context: { reqId: request.id, method: request.method, url: request.url },
        },
        fastify.log as any,
      )
    }

    return reply.code(statusCode).send({
      statusCode,
      error:   isDev || statusCode < 500 ? (err.name ?? 'Internal Server Error') : 'Internal Server Error',
      message: isDev || statusCode < 500 ? err.message : 'An unexpected error occurred',
      ...(isDev && statusCode >= 500 ? { stack: err.stack } : {}),
    })
  })

  return fastify
}
