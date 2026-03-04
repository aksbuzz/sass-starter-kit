import type { FastifyRequest, FastifyReply } from 'fastify'
import type { MemberRole } from '@saas/db'

// ---------------------------------------------------------------------------
// requireRole — RBAC preHandler factory.
export function requireRole(...roles: MemberRole[]) {
  return async function checkRole(
    request: FastifyRequest,
    reply:   FastifyReply,
  ): Promise<void> {
    const ctx = request.ctx

    if (!ctx) {
      return reply.code(500).send({ error: 'Missing request context — ensure authenticate runs first' })
    }

    if (!ctx.tenantId) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No active workspace selected' })
    }

    if (!ctx.role || !roles.includes(ctx.role)) {
      return reply.code(403).send({
        statusCode: 403,
        error:      'Forbidden',
        message:    `This action requires one of: ${roles.join(', ')}`,
      })
    }
  }
}
