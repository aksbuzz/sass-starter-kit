import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify'
import { FeatureFlagService } from '../../services/feature-flag.service.js'
import { authenticate }       from '../../hooks/authenticate.js'
import { requireRole }        from '../../hooks/require-role.js'
import { container }          from '../../container/index.js'
import { TOKENS }             from '../../container/tokens.js'
import { replyWithEtag }      from '../../lib/etag.js'

const featureFlagSvc = container.get<FeatureFlagService>(TOKENS.FeatureFlagService)

const adminPlus  = [authenticate, requireRole('owner', 'admin')]
const memberPlus = [authenticate, requireRole('owner', 'admin', 'member')]

const flagShape = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    key:       { type: 'string' },
    scopeType: { type: 'string' },
    scopeId:   { type: ['string', 'null'] },
    enabled:   { type: 'boolean' },
    config:    { type: 'object' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const resolvedFlagShape = {
  type: 'object',
  properties: {
    key:     { type: 'string' },
    enabled: { type: 'boolean' },
    config:  { type: 'object' },
  },
}

export const featureFlagRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  fastify.get('/feature-flags', {
    schema: {
      tags:     ['feature-flags'],
      summary:  'List tenant-level flag overrides',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            flags: { type: 'array', items: flagShape },
          },
        },
      },
    },
    preHandler: adminPlus,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const flags = await featureFlagSvc.listOverrides(request.ctx!)
      return replyWithEtag(request, reply, { flags })
    },
  })

  fastify.get('/feature-flags/resolve', {
    schema: {
      tags:     ['feature-flags'],
      summary:  'Resolve flags for the current workspace',
      security: [{ bearerAuth: [] }],
      querystring: {
        type:                 'object',
        required:             ['keys'],
        additionalProperties: false,
        properties: {
          keys: { type: 'string', description: 'Comma-separated flag keys' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            flags: {
              type:                 'object',
              additionalProperties: resolvedFlagShape,
            },
          },
        },
      },
    },
    preHandler: memberPlus,
    handler: async (
      request: FastifyRequest<{ Querystring: { keys: string } }>,
      reply:   FastifyReply,
    ) => {
      const keys  = request.query.keys.split(',').map(k => k.trim()).filter(Boolean)
      const flags = await featureFlagSvc.resolveMany(request.ctx!, keys)
      return replyWithEtag(request, reply, { flags })
    },
  })

  fastify.put('/feature-flags/:key', {
    schema: {
      tags:     ['feature-flags'],
      summary:  'Set a tenant-level flag override',
      security: [{ bearerAuth: [] }],
      params: {
        type:       'object',
        required:   ['key'],
        properties: { key: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z0-9_.-]+$' } },
      },
      body: {
        type:                 'object',
        required:             ['enabled'],
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          config:  { type: 'object', default: {} },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: { flag: flagShape },
        },
      },
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Params: { key: string }; Body: { enabled: boolean; config?: Record<string, unknown> } }>,
      reply:   FastifyReply,
    ) => {
      const { key }            = request.params
      const { enabled, config } = request.body
      const flag = await featureFlagSvc.setOverride(request.ctx!, key, enabled, config)
      return reply.send({ flag })
    },
  })

  fastify.delete('/feature-flags/:key', {
    schema: {
      tags:     ['feature-flags'],
      summary:  'Remove a tenant-level flag override',
      security: [{ bearerAuth: [] }],
      params: {
        type:       'object',
        required:   ['key'],
        properties: { key: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z0-9_.-]+$' } },
      },
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Params: { key: string } }>,
      reply:   FastifyReply,
    ) => {
      await featureFlagSvc.deleteOverride(request.ctx!, request.params.key)
      return reply.code(204).send()
    },
  })
}
