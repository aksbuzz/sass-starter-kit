// reflect-metadata must be imported before ANY Inversify-decorated class is loaded.
import './container/index.js'

import { createBaseApp } from '@saas/core'

// ── Route layers ────────────────────────────────────────────────────────────
import { coreRoutes }     from './core/routes.js'
import { enabledModules } from './modules/registry.js'

export async function buildApp() {
  const fastify = await createBaseApp()

  // 1. Core routes (auth + tenant workspace CRUD)
  await fastify.register(coreRoutes)

  // 2. Opt-in module routes
  await fastify.register(async (app) => {
    for (const mod of enabledModules) {
      await app.register(mod.routes)
    }
  })

  return fastify
}
