import type { MemberRole } from '@saas/db'


export interface AccessTokenPayload {
  purpose: 'access'
  sub:  string         // userId
  sid:  string
  tid:  string | null
  role: MemberRole | null
  ipa?: boolean        // isPlatformAdmin — present when true
  imp?: string         // impersonator userId — present only during impersonation
  iat:  number
  exp:  number
}

export interface RefreshTokenPayload {
  purpose: 'refresh'
  sub: string
  sid: string
  iat: number
  exp: number
}

// Per-request context — populated by the authenticate preHandler hook.
export interface RequestContext {
  userId:          string
  sessionId:       string
  tenantId:        string | null
  role:            MemberRole | null
  planId:          string | null
  planSlug:        string | null
  isPlatformAdmin: boolean
  /** Set when this session is an impersonation — holds the admin's real user ID */
  impersonatorId?: string
}


declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext | null
    metricsStartTime: number
  }

  interface FastifyInstance {
    // authenticate preHandler (add to any route that needs auth)
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
  }
}

// payload — iat/exp are added by the library.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Omit<AccessTokenPayload, 'iat' | 'exp'> | Omit<RefreshTokenPayload, 'iat' | 'exp'>
    user:    AccessTokenPayload | RefreshTokenPayload
  }
}
