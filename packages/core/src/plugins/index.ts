import type { FastifyInstance } from 'fastify'
import { registerMetrics }   from './metrics.js'
import { registerSecurity }  from './security.js'
import { registerJwt }       from './jwt.js'
import { registerRateLimit } from './rate-limit.js'
import { registerSwagger }   from './swagger.js'

// Plugin registration order matters
export async function registerPlugins(fastify: FastifyInstance): Promise<void> {
  await registerMetrics(fastify)    // first — timing hooks must be registered early
  await registerSecurity(fastify)
  await registerJwt(fastify)
  await registerRateLimit(fastify)
  await registerSwagger(fastify)   // no-op in production
}
