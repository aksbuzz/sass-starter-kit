import type { FastifyRequest, FastifyReply } from 'fastify'
import { UsersRepository, adminSql } from '@saas/db'

const users = new UsersRepository(adminSql)

export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  const ctx = request.ctx

  if (!ctx) {
    return reply.code(500).send({ error: 'Missing request context — ensure authenticate runs first' })
  }

  const user = await users.findById(ctx.userId)
  if (!user || !user.isPlatformAdmin) {
    return reply.code(403).send({
      statusCode: 403,
      error:      'Forbidden',
      message:    'Platform admin access required',
    })
  }
}
