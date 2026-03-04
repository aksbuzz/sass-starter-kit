import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsync } from 'fastify'
import { ApiKeyService, authenticate, requireRole, TOKENS } from '@saas/core'
import { container }               from '../../container/index.js'

const adminPlus  = [authenticate, requireRole('owner', 'admin')]
const memberPlus = [authenticate, requireRole('owner', 'admin', 'member')]


const apiKeyShape = {
  type: 'object',
  properties: {
    id:         { type: 'string' },
    name:       { type: 'string' },
    prefix:     { type: 'string' },
    scopes:     { type: 'array', items: { type: 'string' } },
    lastUsedAt: { type: ['string', 'null'], format: 'date-time' },
    expiresAt:  { type: ['string', 'null'], format: 'date-time' },
    revokedAt:  { type: ['string', 'null'], format: 'date-time' },
    createdAt:  { type: 'string', format: 'date-time' },
  },
}

export const apiKeyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const apiKeySvc = container.get<ApiKeyService>(TOKENS.ApiKeyService)

  fastify.get('/api-keys', {
    schema: {
      tags:     ['api-keys'],
      summary:  'List API keys for the current workspace',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            apiKeys: { type: 'array', items: apiKeyShape },
          },
        },
      },
    },
    preHandler: memberPlus,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const apiKeys = await apiKeySvc.list(request.ctx!)
      return reply.send({ apiKeys })
    },
  })

  fastify.post('/api-keys', {
    schema: {
      tags:     ['api-keys'],
      summary:  'Create a new API key (full key returned once)',
      security: [{ bearerAuth: [] }],
      body: {
        type:                 'object',
        required:             ['name'],
        additionalProperties: false,
        properties: {
          name:      { type: 'string', minLength: 1, maxLength: 100 },
          scopes:    { type: 'array', items: { type: 'string', minLength: 1, maxLength: 50 }, maxItems: 20, default: [] },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            fullKey: { type: 'string' },
            apiKey:  apiKeyShape,
          },
        },
      },
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Body: { name: string; scopes?: string[]; expiresAt?: string } }>,
      reply:   FastifyReply,
    ) => {
      const { name, scopes, expiresAt } = request.body
      const created = await apiKeySvc.create(request.ctx!, {
        name,
        ...(scopes !== undefined && { scopes }),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      const { fullKey, ...apiKey } = created
      return reply.code(201).send({ fullKey, apiKey })
    },
  })

  fastify.delete('/api-keys/:id', {
    schema: {
      tags:     ['api-keys'],
      summary:  'Revoke an API key',
      security: [{ bearerAuth: [] }],
      params: {
        type:       'object',
        required:   ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply:   FastifyReply,
    ) => {
      await apiKeySvc.revoke(request.ctx!, request.params.id)
      return reply.code(204).send()
    },
  })
}
