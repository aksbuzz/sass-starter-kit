import './container.js'
import { createBaseApp } from '@saas/core'
import { controlPlaneRoutes } from './routes.js'

export async function buildApp() {
  const fastify = await createBaseApp()
  await fastify.register(controlPlaneRoutes)
  return fastify
}
