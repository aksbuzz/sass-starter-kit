import type { FastifyPluginAsync } from 'fastify'
import { authRoutes }   from './auth/routes.js'
import { tenantRoutes } from './tenant/routes.js'

export const coreRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authRoutes)
  await fastify.register(tenantRoutes)
}
