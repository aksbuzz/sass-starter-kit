import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsync }  from 'fastify'
import { TenantService }            from '../../services/tenant.service.js'
import { authenticate }             from '../../hooks/authenticate.js'
import { requireRole }              from '../../hooks/require-role.js'
import { container }                from '../../container/index.js'
import { TOKENS }                   from '../../container/tokens.js'
import { membersRoutes }            from './members.js'
import { replyWithEtag }            from '../../lib/etag.js'
import {
  createTenantBody,
  updateTenantBody,
  workspaceContextResponse,
} from './schemas.js'

const tenantSvc = container.get<TenantService>(TOKENS.TenantService)

const adminPlus = [authenticate, requireRole('owner', 'admin')]
const ownerOnly = [authenticate, requireRole('owner')]

export const tenantsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // Any authenticated user can create workspaces (they become the owner).
  fastify.post('/tenants', {
    schema: {
      tags:     ['tenants'],
      summary:  'Create a new workspace',
      security: [{ bearerAuth: [] }],
      body:     createTenantBody,
    },
    preHandler: [authenticate],
    handler: async (
      request: FastifyRequest<{ Body: { name: string; slug?: string } }>,
      reply:   FastifyReply,
    ) => {
      const { name, slug } = request.body
      const { tenant, membership } = await tenantSvc.create(request.ctx!.userId, { name, slug })
      return reply.code(201).send({ tenant, membership })
    },
  })

  fastify.get('/tenants', {
    schema: {
      tags:     ['tenants'],
      summary:  'List all workspaces for the authenticated user',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const workspaces = await tenantSvc.listForUser(request.ctx!.userId)
      return replyWithEtag(request, reply, { workspaces })
    },
  })

  fastify.get('/tenants/me', {
    schema: {
      tags:     ['tenants'],
      summary:  'Get current workspace context (tenant, subscription, flags, membership)',
      security: [{ bearerAuth: [] }],
      response: workspaceContextResponse,
    },
    preHandler: [authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.ctx!.tenantId) {
        return reply.code(400).send({ error: 'No active workspace — select one first via POST /auth/workspace' })
      }
      const context = await tenantSvc.getContext(request.ctx!)
      return replyWithEtag(request, reply, context)
    },
  })

  fastify.patch('/tenants/me', {
    schema: {
      tags:     ['tenants'],
      summary:  'Update workspace name or settings',
      security: [{ bearerAuth: [] }],
      body:     updateTenantBody,
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Body: { name?: string; settings?: Record<string, unknown> } }>,
      reply:   FastifyReply,
    ) => {
      const tenant = await tenantSvc.update(request.ctx!, request.body)
      return reply.send({ tenant })
    },
  })

  fastify.delete('/tenants/me', {
    schema: {
      tags:     ['tenants'],
      summary:  'Soft-delete workspace (owner only)',
      security: [{ bearerAuth: [] }],
    },
    preHandler: ownerOnly,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      await tenantSvc.softDelete(request.ctx!)
      return reply.code(204).send()
    },
  })

  // ── Member + invitation sub-routes ────────────────────────────────────────
  await fastify.register(membersRoutes)
}
