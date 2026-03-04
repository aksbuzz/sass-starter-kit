// reflect-metadata MUST be the very first import in the application.
import 'reflect-metadata'

import { buildCoreContainer }    from '@saas/core'
import { enabledModules }        from '../modules/registry.js'

// Root container — one instance per process, not per-request.
// Built in layers: core → opt-in modules (control-plane removed to apps/admin).
export function buildContainer() {
  const container = buildCoreContainer()

  for (const mod of enabledModules) {
    mod.container?.(container)
  }

  return container
}

export const container = buildContainer()
