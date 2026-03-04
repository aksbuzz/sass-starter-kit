import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify'
import { AuditLogService, authenticate, requireRole, TOKENS } from '@saas/core'
import { container }       from '../../container/index.js'

const adminPlus = [authenticate, requireRole('owner', 'admin')]

const auditLogShape = {
  type: 'object',
  properties: {
    id:           { type: 'string' },
    tenantId:     { type: 'string' },
    userId:       { type: ['string', 'null'] },
    action:       { type: 'string' },
    resourceType: { type: 'string' },
    resourceId:   { type: ['string', 'null'] },
    before:       { type: ['object', 'null'] },
    after:        { type: ['object', 'null'] },
    metadata:     { type: 'object' },
    createdAt:    { type: 'string', format: 'date-time' },
  },
}

export const auditLogRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const auditLogSvc = container.get<AuditLogService>(TOKENS.AuditLogService)

  fastify.get('/audit-logs', {
    schema: {
      tags:     ['audit-logs'],
      summary:  'List audit log entries for the current workspace',
      security: [{ bearerAuth: [] }],
      querystring: {
        type:                 'object',
        additionalProperties: false,
        properties: {
          action:       { type: 'string', description: 'Exact action match, e.g. api_keys.create' },
          resourceType: { type: 'string', description: 'E.g. ApiKey, Membership' },
          resourceId:   { type: 'string' },
          userId:       { type: 'string', format: 'uuid' },
          from:         { type: 'string', format: 'date-time', description: 'Inclusive lower bound' },
          to:           { type: 'string', format: 'date-time', description: 'Exclusive upper bound' },
          limit:        { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          offset:       { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            rows:   { type: 'array', items: auditLogShape },
            total:  { type: 'integer' },
            limit:  { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
      },
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{
        Querystring: {
          action?:       string
          resourceType?: string
          resourceId?:   string
          userId?:       string
          from?:         string
          to?:           string
          limit?:        number
          offset?:       number
        }
      }>,
      reply: FastifyReply,
    ) => {
      const { action, resourceType, resourceId, userId, from, to, limit = 50, offset = 0 } = request.query

      const result = await auditLogSvc.list(request.ctx!, {
        action,
        resourceType,
        resourceId,
        userId,
        from:   from   ? new Date(from)  : undefined,
        to:     to     ? new Date(to)    : undefined,
        limit,
        offset,
      })

      return reply.send({ ...result, limit, offset })
    },
  })
}
