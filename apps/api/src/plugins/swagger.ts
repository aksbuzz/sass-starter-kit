import type { FastifyInstance } from 'fastify'
import fastifySwagger   from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { config }       from '../config.js'

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  if (config.NODE_ENV !== 'development') return

  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title:       'SaaS Starter Kit API',
        description: 'Multi-tenant SaaS API — REST + GraphQL',
        version:     '0.1.0',
      },
      servers: [{ url: config.API_URL }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type:         'http',
            scheme:       'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'auth',     description: 'Authentication & OAuth' },
        { name: 'tenants',  description: 'Tenant management' },
        { name: 'members',  description: 'Membership & RBAC' },
        { name: 'billing',  description: 'Subscriptions & Stripe' },
        { name: 'flags',    description: 'Feature flags' },
        { name: 'webhooks', description: 'Outbound webhooks' },
        { name: 'keys',     description: 'API key management' },
      ],
    },
  })

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })
}
