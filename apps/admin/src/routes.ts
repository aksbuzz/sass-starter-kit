import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsync } from 'fastify'
import {
  AdminService,
  authenticate,
  requirePlatformAdmin,
  TOKENS,
} from '@saas/core'
import { container } from './container.js'

const platformAdmin = [authenticate, requirePlatformAdmin]

export const controlPlaneRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const adminSvc = container.get<AdminService>(TOKENS.AdminService)

  // ── Stats ──────────────────────────────────────────────────────────────────

  fastify.get('/admin/stats', {
    schema: {
      tags:     ['admin'],
      summary:  'Platform-level metrics',
      security: [{ bearerAuth: [] }],
    },
    preHandler: platformAdmin,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await adminSvc.getStats()
      return reply.send(stats)
    },
  })

  // ── Tenants ────────────────────────────────────────────────────────────────

  fastify.get('/admin/tenants', {
    schema: {
      tags:     ['admin'],
      summary:  'List all tenants',
      security: [{ bearerAuth: [] }],
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; status?: string; search?: string } }>,
      reply:   FastifyReply,
    ) => {
      const limit  = Math.min(parseInt(request.query.limit  ?? '50', 10), 100)
      const offset = parseInt(request.query.offset ?? '0', 10)
      const result = await adminSvc.listTenants({
        limit,
        offset,
        ...(request.query.status ? { status: request.query.status } : {}),
        ...(request.query.search ? { search: request.query.search } : {}),
      })
      return reply.send({ ...result, limit, offset })
    },
  })

  fastify.post('/admin/tenants', {
    schema: {
      tags:     ['admin'],
      summary:  'Create a new tenant and optionally invite the first owner',
      security: [{ bearerAuth: [] }],
      body: {
        type:                 'object',
        required:             ['name'],
        additionalProperties: false,
        properties: {
          name:        { type: 'string', minLength: 1, maxLength: 100 },
          slug:        { type: 'string', minLength: 1, maxLength: 60, pattern: '^[a-z0-9-]+$' },
          ownerEmail:  { type: 'string', format: 'email' },
          planId:      { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Body: { name: string; slug?: string; ownerEmail?: string; planId?: string } }>,
      reply:   FastifyReply,
    ) => {
      const result = await adminSvc.createTenant(request.body)
      return reply.code(201).send(result)
    },
  })

  fastify.get('/admin/tenants/:id', {
    schema: {
      tags:     ['admin'],
      summary:  'Get tenant detail',
      security: [{ bearerAuth: [] }],
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply:   FastifyReply,
    ) => {
      const detail = await adminSvc.getTenant(request.params.id)
      return reply.send(detail)
    },
  })

  fastify.patch('/admin/tenants/:id', {
    schema: {
      tags:     ['admin'],
      summary:  'Update tenant status or name',
      security: [{ bearerAuth: [] }],
      body: {
        type:                 'object',
        additionalProperties: false,
        properties: {
          name:   { type: 'string', minLength: 1, maxLength: 100 },
          status: { type: 'string', enum: ['trialing', 'active', 'suspended', 'deleted'] },
        },
      },
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; status?: string } }>,
      reply:   FastifyReply,
    ) => {
      const tenant = await adminSvc.updateTenant(request.params.id, request.body as Parameters<AdminService['updateTenant']>[1])
      return reply.send({ tenant })
    },
  })

  fastify.delete('/admin/tenants/:id', {
    schema: {
      tags:     ['admin'],
      summary:  'Soft-delete a tenant',
      security: [{ bearerAuth: [] }],
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply:   FastifyReply,
    ) => {
      await adminSvc.deleteTenant(request.params.id)
      return reply.code(204).send()
    },
  })

  // ── Users ──────────────────────────────────────────────────────────────────

  fastify.get('/admin/users', {
    schema: {
      tags:     ['admin'],
      summary:  'List all users',
      security: [{ bearerAuth: [] }],
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; search?: string } }>,
      reply:   FastifyReply,
    ) => {
      const limit  = Math.min(parseInt(request.query.limit  ?? '50', 10), 100)
      const offset = parseInt(request.query.offset ?? '0', 10)
      const result = await adminSvc.listUsers({
        limit,
        offset,
        ...(request.query.search ? { search: request.query.search } : {}),
      })
      return reply.send({ ...result, limit, offset })
    },
  })

  // ── Platform feature flags ─────────────────────────────────────────────────

  fastify.get('/admin/feature-flags', {
    schema: {
      tags:     ['admin'],
      summary:  'List platform-level feature flag defaults',
      security: [{ bearerAuth: [] }],
    },
    preHandler: platformAdmin,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const flags = await adminSvc.listPlatformFlags()
      return reply.send({ flags })
    },
  })

  fastify.put('/admin/feature-flags/:key', {
    schema: {
      tags:     ['admin'],
      summary:  'Set a platform-level feature flag default',
      security: [{ bearerAuth: [] }],
      body: {
        type:                 'object',
        required:             ['enabled'],
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          config:  { type: 'object' },
        },
      },
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Params: { key: string }; Body: { enabled: boolean; config?: Record<string, unknown> } }>,
      reply:   FastifyReply,
    ) => {
      const flag = await adminSvc.upsertPlatformFlag(request.params.key, request.body.enabled, request.body.config)
      return reply.send({ flag })
    },
  })

  fastify.delete('/admin/feature-flags/:key', {
    schema: {
      tags:     ['admin'],
      summary:  'Delete a platform-level feature flag default',
      security: [{ bearerAuth: [] }],
    },
    preHandler: platformAdmin,
    handler: async (
      request: FastifyRequest<{ Params: { key: string } }>,
      reply:   FastifyReply,
    ) => {
      await adminSvc.deletePlatformFlag(request.params.key)
      return reply.code(204).send()
    },
  })
}
