import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsync } from 'fastify'
import { WebhookService, authenticate, requireRole, TOKENS } from '@saas/core'
import { container }               from '../../container/index.js'
import { WEBHOOK_EVENTS }          from '@saas/config'

const adminPlus  = [authenticate, requireRole('owner', 'admin')]
const memberPlus = [authenticate, requireRole('owner', 'admin', 'member')]

const idParamsSchema = {
  type:       'object',
  required:   ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
}

const endpointShape = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    url:       { type: 'string' },
    events:    { type: 'array', items: { type: 'string' } },
    isActive:  { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const endpointWithSecretShape = {
  ...endpointShape,
  properties: {
    ...endpointShape.properties,
    secret: { type: 'string' },
  },
}

const deliveryShape = {
  type: 'object',
  properties: {
    id:           { type: 'string' },
    eventType:    { type: 'string' },
    statusCode:   { type: ['integer', 'null'] },
    responseBody: { type: ['string', 'null'] },
    durationMs:   { type: ['integer', 'null'] },
    attempt:      { type: 'integer' },
    deliveredAt:  { type: ['string', 'null'], format: 'date-time' },
    createdAt:    { type: 'string', format: 'date-time' },
  },
}

export const webhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const webhookSvc = container.get<WebhookService>(TOKENS.WebhookService)

  fastify.get('/webhooks', {
    schema: {
      tags:     ['webhooks'],
      summary:  'List outbound webhook endpoints',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            endpoints: { type: 'array', items: endpointShape },
          },
        },
      },
    },
    preHandler: memberPlus,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const endpoints = await webhookSvc.listEndpoints(request.ctx!)
      return reply.send({ endpoints })
    },
  })

  fastify.post('/webhooks', {
    schema: {
      tags:     ['webhooks'],
      summary:  'Create a webhook endpoint (secret returned once)',
      security: [{ bearerAuth: [] }],
      body: {
        type:                 'object',
        required:             ['url'],
        additionalProperties: false,
        properties: {
          url:    { type: 'string', format: 'uri', maxLength: 2048 },
          events: {
            type:     'array',
            items:    { type: 'string', enum: [...WEBHOOK_EVENTS] },
            maxItems: WEBHOOK_EVENTS.length,
            default:  [],
            description: 'Empty array = subscribe to all events',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            endpoint: endpointWithSecretShape,
          },
        },
      },
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Body: { url: string; events?: string[] } }>,
      reply:   FastifyReply,
    ) => {
      const endpoint = await webhookSvc.createEndpoint(request.ctx!, {
        url:    request.body.url,
        events: request.body.events ?? [],
      })
      return reply.code(201).send({ endpoint })
    },
  })

  fastify.patch('/webhooks/:id', {
    schema: {
      tags:     ['webhooks'],
      summary:  'Update a webhook endpoint',
      security: [{ bearerAuth: [] }],
      params:   idParamsSchema,
      body: {
        type:                 'object',
        additionalProperties: false,
        minProperties:        1,
        properties: {
          url:      { type: 'string', format: 'uri', maxLength: 2048 },
          events:   { type: 'array', items: { type: 'string', enum: [...WEBHOOK_EVENTS] }, maxItems: WEBHOOK_EVENTS.length },
          isActive: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: { endpoint: endpointShape },
        },
      },
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{
        Params: { id: string }
        Body:   { url?: string; events?: string[]; isActive?: boolean }
      }>,
      reply: FastifyReply,
    ) => {
      const endpoint = await webhookSvc.updateEndpoint(
        request.ctx!,
        request.params.id,
        request.body,
      )
      return reply.send({ endpoint })
    },
  })

  fastify.delete('/webhooks/:id', {
    schema: {
      tags:     ['webhooks'],
      summary:  'Delete a webhook endpoint',
      security: [{ bearerAuth: [] }],
      params:   idParamsSchema,
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply:   FastifyReply,
    ) => {
      await webhookSvc.deleteEndpoint(request.ctx!, request.params.id)
      return reply.code(204).send()
    },
  })

  fastify.get('/webhooks/:id/deliveries', {
    schema: {
      tags:     ['webhooks'],
      summary:  'List recent delivery attempts for an endpoint',
      security: [{ bearerAuth: [] }],
      params:   idParamsSchema,
      querystring: {
        type:                 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            deliveries: { type: 'array', items: deliveryShape },
          },
        },
      },
    },
    preHandler: memberPlus,
    handler: async (
      request: FastifyRequest<{
        Params:      { id: string }
        Querystring: { limit?: number }
      }>,
      reply: FastifyReply,
    ) => {
      const deliveries = await webhookSvc.listDeliveries(
        request.ctx!,
        request.params.id,
        request.query.limit,
      )
      return reply.send({ deliveries })
    },
  })
}
