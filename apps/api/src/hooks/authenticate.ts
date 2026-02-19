import type { FastifyRequest, FastifyReply } from 'fastify'
import { SessionsRepository }  from '@saas/db'
import { adminSql }            from '@saas/db'
import type { SessionData }    from '@saas/db'
import type { AccessTokenPayload, RequestContext } from '../types.js'


// ---------------------------------------------------------------------------
// Why role/plan come from the session DB row, not the JWT claim:
//   • The access token is issued with role: null before workspace selection
//     (the user hasn't chosen which tenant to operate in yet).
//   • After POST /auth/workspace the session row is updated with the correct role.
//   • Since we hit the DB for session validation on every request anyway, reading
//     role/plan from the authoritative session snapshot costs zero extra queries
//     and always reflects the current state (survives role changes + plan upgrades
//     without needing a new JWT).
// ---------------------------------------------------------------------------

const sessions = new SessionsRepository(adminSql)

export async function authenticate(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  let payload: AccessTokenPayload
  try {
    await request.jwtVerify()
    payload = request.user as AccessTokenPayload
  } catch {
    return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' })
  }

  if (payload.purpose !== 'access') {
    return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Wrong token type' })
  }

  const session = await sessions.findValid(payload.sid)
  if (!session) {
    return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Session expired or revoked' })
  }

  const data = session.data as SessionData

  const ctx: RequestContext = {
    userId:    payload.sub,
    sessionId: payload.sid,
    tenantId:  payload.tid ?? null,
    role:      data.role     ?? null,
    planId:    data.planId   || null,
    planSlug:  data.planSlug || null,
    impersonatorId: data.impersonatorId ?? undefined,
  }

  request.ctx = ctx
}
