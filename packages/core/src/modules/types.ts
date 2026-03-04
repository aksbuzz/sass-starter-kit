import type { Container }        from 'inversify'
import type { FastifyPluginAsync } from 'fastify'

/**
 * Standard interface for an app-plane module.
 *
 * Each module is a self-contained unit with optional DI bindings and
 * Fastify routes. Toggle modules in `modules/registry.ts`.
 */
export interface ApiModule {
  /** Human-readable name used in logs and Swagger tags */
  name: string

  /** Register Inversify bindings (services, clients, etc.) */
  container?: (c: Container) => void

  /** Fastify plugin that registers all HTTP routes for this module */
  routes: FastifyPluginAsync
}
