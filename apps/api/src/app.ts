// reflect-metadata must be imported before ANY Inversify-decorated class is loaded.
import './container/index.js'

import Fastify           from 'fastify'
import { registerPlugins } from './plugins/index.js'
import { registerRoutes }  from './routes/index.js'
import { config }          from './config.js'
import { authenticate }    from './hooks/authenticate.js'
import { notify }          from './lib/notify.js'
import { initDbMetrics }   from './lib/metrics-hooks.js'

export async function buildApp() {
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
  initDbMetrics(fastify.log)

  // Decorate request with null context before any routes run.
  fastify.decorateRequest('ctx', null)

  // Expose authenticate as a named hook on the fastify instance
  // so route files can reference it as fastify.authenticate
  fastify.decorate('authenticate', authenticate)

  await registerPlugins(fastify)
  await registerRoutes(fastify)

  fastify.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode ?? 500
    const isDev      = config.NODE_ENV !== 'production'

    if (statusCode >= 500) {
      await notify(
        {
          level:   'error',
          message: error.message,
          error,
          context: { reqId: request.id, method: request.method, url: request.url },
        },
        fastify.log,
      )
    }

    return reply.code(statusCode).send({
      statusCode,
      error:   isDev || statusCode < 500 ? (error.name ?? 'Internal Server Error') : 'Internal Server Error',
      message: isDev || statusCode < 500 ? error.message : 'An unexpected error occurred',
      ...(isDev && statusCode >= 500 ? { stack: error.stack } : {}),
    })
  })

  return fastify
}
