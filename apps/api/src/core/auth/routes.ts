import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsync } from 'fastify'
import {
  AuthService,
  TenantService,
  authenticate,
  REFRESH_COOKIE_OPTIONS,
  TOKENS,
  config,
  buildPermissions,
  type OAuthProvider,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from '@saas/core'
import { container }                        from '../../container/index.js'
import { withAdmin, type SessionData }      from '@saas/db'


const AUTH_RATE_LIMIT = { max: config.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' }

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const authService   = container.get<AuthService>(TOKENS.AuthService)
  const tenantService = container.get<TenantService>(TOKENS.TenantService)

  const oauthInitHandler = (provider: OAuthProvider) =>
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const url = await authService.initiateOAuth(provider)
      return reply.redirect(url)
    }

  fastify.get('/auth/google', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    schema: { tags: ['auth'], summary: 'Initiate Google OAuth flow' },
    handler: oauthInitHandler('google'),
  })

  fastify.get('/auth/github', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    schema: { tags: ['auth'], summary: 'Initiate GitHub OAuth flow' },
    handler: oauthInitHandler('github'),
  })

  interface CallbackQuery { code?: string; state?: string; error?: string }

  const callbackQuerySchema = {
    type:                 'object',
    additionalProperties: true,  // providers may add extra params
    properties: {
      code:  { type: 'string' },
      state: { type: 'string' },
      error: { type: 'string' },
    },
  }

  const oauthCallbackHandler = (provider: OAuthProvider) =>
    async (request: FastifyRequest<{ Querystring: CallbackQuery }>, reply: FastifyReply) => {
      const { code, state, error } = request.query

      if (error) {
        fastify.log.warn({ error }, 'OAuth provider returned an error')
        const safe = encodeURIComponent(error.slice(0, 200))
        return reply.redirect(`${config.WEB_URL}/auth/error?reason=${safe}`)
      }

      if (!code || !state) {
        return reply.redirect(`${config.WEB_URL}/auth/error?reason=missing_params`)
      }

      let result
      try {
        result = await authService.handleOAuthCallback(provider, code, state, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'OAuth error'
        fastify.log.error({ err }, 'OAuth callback failed')
        return reply.redirect(`${config.WEB_URL}/auth/error?reason=${encodeURIComponent(msg.slice(0, 200))}`)
      }

      const authCode = await authService.createAuthCode(result)
      return reply.redirect(`${config.WEB_URL}/auth/callback?code=${authCode}`)
    }

  fastify.get('/auth/google/callback', {
    config:  { rateLimit: AUTH_RATE_LIMIT },
    schema:  { tags: ['auth'], summary: 'Google OAuth callback', hide: true, querystring: callbackQuerySchema },
    handler: oauthCallbackHandler('google'),
  })

  fastify.get('/auth/github/callback', {
    config:  { rateLimit: AUTH_RATE_LIMIT },
    schema:  { tags: ['auth'], summary: 'GitHub OAuth callback', hide: true, querystring: callbackQuerySchema },
    handler: oauthCallbackHandler('github'),
  })

  fastify.post('/auth/exchange', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    schema: {
      tags:    ['auth'],
      summary: 'Exchange one-time auth code for access + refresh tokens',
      body: {
        type:                 'object',
        required:             ['code'],
        additionalProperties: false,
        properties: {
          code: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: {
          type:       'object',
          properties: { accessToken: { type: 'string' } },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Body: { code: string } }>, reply: FastifyReply) => {
      const result = await authService.exchangeAuthCode(request.body.code)
      if (!result) {
        return reply.code(401).send({ error: 'Invalid or expired auth code' })
      }

      const accessPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
        purpose: 'access',
        sub:     result.userId,
        sid:     result.sessionId,
        tid:     result.tenantId,
        role:    null,  // populated after workspace selection
        ...(result.isPlatformAdmin ? { ipa: true as const } : {}),
      }

      const refreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
        purpose: 'refresh',
        sub:     result.userId,
        sid:     result.sessionId,
      }

      const accessToken  = fastify.jwt.sign(accessPayload,  { expiresIn: config.JWT_ACCESS_EXPIRES_IN  })
      const refreshToken = fastify.jwt.sign(refreshPayload, { expiresIn: config.JWT_REFRESH_EXPIRES_IN })

      reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
      return { accessToken }
    },
  })

  fastify.post('/auth/refresh', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    schema: {
      tags:     ['auth'],
      summary:  'Rotate refresh token and issue new access token',
      response: {
        200: {
          type: 'object',
          properties: { accessToken: { type: 'string' } },
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const rawRefreshToken = request.cookies['refresh_token']
      if (!rawRefreshToken) {
        return reply.code(401).send({ error: 'No refresh token' })
      }

      let payload: RefreshTokenPayload
      try {
        payload = fastify.jwt.verify<RefreshTokenPayload>(rawRefreshToken)
      } catch {
        return reply.code(401).send({ error: 'Invalid or expired refresh token' })
      }

      if (payload.purpose !== 'refresh') {
        return reply.code(401).send({ error: 'Wrong token type' })
      }

      let result
      try {
        result = await authService.rotateSession(payload.sid, payload.sub, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 401
        return reply.code(status).send({ error: err instanceof Error ? err.message : 'Refresh failed' })
      }

      const newAccessPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
        purpose: 'access',
        sub:     result.userId,
        sid:     result.sessionId,
        tid:     result.tenantId,
        role:    result.role as AccessTokenPayload['role'],
        ...(result.isPlatformAdmin ? { ipa: true as const } : {}),
        ...(result.impersonatorId ? { imp: result.impersonatorId } : {}),
      }

      const newRefreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
        purpose: 'refresh',
        sub:     result.userId,
        sid:     result.sessionId,
      }

      const refreshExpiry = result.impersonatorId ? '2h' : config.JWT_REFRESH_EXPIRES_IN
      const newAccessToken  = fastify.jwt.sign(newAccessPayload,  { expiresIn: config.JWT_ACCESS_EXPIRES_IN })
      const newRefreshToken = fastify.jwt.sign(newRefreshPayload, { expiresIn: refreshExpiry })

      reply.setCookie('refresh_token', newRefreshToken, REFRESH_COOKIE_OPTIONS)
      return { accessToken: newAccessToken }
    },
  })

  // Why a separate round-trip instead of embedding tenantId in the OAuth callback?
  //   • A user may belong to many tenants; we can't know which one to activate at login.
  //   • The workspace switcher calls this whenever the user picks a different tenant.

  fastify.post('/auth/workspace', {
    config: { rateLimit: AUTH_RATE_LIMIT },
    schema: {
      tags:     ['auth'],
      summary:  'Select or switch active workspace — re-issues access token with tenant context',
      security: [{ bearerAuth: [] }],
      body: {
        type:                 'object',
        required:             ['tenantId'],
        additionalProperties: false,
        properties: {
          tenantId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type:       'object',
          properties: { accessToken: { type: 'string' } },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (
      request: FastifyRequest<{ Body: { tenantId: string } }>,
      reply:   FastifyReply,
    ) => {
      const ctx      = request.ctx!
      const tenantId = request.body.tenantId

      if (ctx.isPlatformAdmin) {
        return reply.code(403).send({
          statusCode: 403,
          error:      'Forbidden',
          message:    'Platform admins do not have workspace membership. Use the admin panel to manage workspaces.',
        })
      }

      if (ctx.impersonatorId) {
        return reply.code(403).send({
          statusCode: 403,
          error:      'Forbidden',
          message:    'Cannot switch workspace while impersonating. Stop impersonation first.',
        })
      }

      const workspace = await tenantService.selectWorkspace(ctx.userId, tenantId)

      // Patch the existing session so the refresh token stays valid
      await withAdmin(({ repos }) =>
        repos.sessions.updateTenantContext(
          ctx.sessionId,
          tenantId,
          workspace.sessionData as unknown as Record<string, unknown>,
        ),
      )

      const accessPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
        purpose: 'access',
        sub:     ctx.userId,
        sid:     ctx.sessionId,
        tid:     tenantId,
        role:    workspace.role,
        ...(ctx.isPlatformAdmin ? { ipa: true as const } : {}),
      }

      const accessToken = fastify.jwt.sign(accessPayload, { expiresIn: config.JWT_ACCESS_EXPIRES_IN })
      return reply.send({ accessToken })
    },
  })

  fastify.delete('/auth/logout', {
    schema: {
      tags:     ['auth'],
      summary:  'Invalidate current session',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { sessionId } = request.ctx!
      await authService.logout(sessionId)
      reply.clearCookie('refresh_token', { path: REFRESH_COOKIE_OPTIONS.path })
      return reply.code(204).send()
    },
  })

  // ── Impersonation ──────────────────────────────────────────────────────────

  fastify.post('/auth/impersonate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      tags:     ['auth'],
      summary:  'Start impersonating a workspace member (workspace owner only)',
      security: [{ bearerAuth: [] }],
      body: {
        type:                 'object',
        required:             ['targetUserId', 'tenantId'],
        additionalProperties: false,
        properties: {
          targetUserId: { type: 'string', format: 'uuid' },
          tenantId:     { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type:       'object',
          properties: { accessToken: { type: 'string' } },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (
      request: FastifyRequest<{ Body: { targetUserId: string; tenantId: string } }>,
      reply:   FastifyReply,
    ) => {
      const ctx = request.ctx!
      const { targetUserId, tenantId } = request.body

      // Only workspace owners can impersonate, and only within their active workspace
      if (ctx.role !== 'owner' || ctx.tenantId !== tenantId) {
        return reply.code(403).send({
          statusCode: 403,
          error:      'Forbidden',
          message:    'Only workspace owners can impersonate users within their workspace',
        })
      }

      // Prevent impersonation of platform admins
      const targetUser = await withAdmin(({ repos }) => repos.users.findByIdOrThrow(targetUserId))
      if (targetUser.isPlatformAdmin) {
        return reply.code(403).send({
          statusCode: 403,
          error:      'Forbidden',
          message:    'Cannot impersonate a platform admin',
        })
      }

      // Verify the target user is a member of the specified workspace
      const workspace = await tenantService.selectWorkspace(targetUserId, tenantId)

      // Build session data with impersonation metadata
      const sessionData: SessionData = {
        ...workspace.sessionData,
        impersonatorId:        ctx.userId,
        impersonatorSessionId: ctx.sessionId,
      }

      let impersonationSessionId = ''

      await withAdmin(async ({ repos }) => {
        // Create a new session AS the target user (time-boxed to 2 hours)
        const session = await repos.sessions.create({
          userId:    targetUserId,
          tenantId,
          data:      sessionData,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1_000),
        })
        impersonationSessionId = session.id

        // Audit log the impersonation start
        await repos.auditLogs.create({
          tenantId,
          userId:       ctx.userId,
          action:       'auth.impersonate_start',
          resourceType: 'User',
          resourceId:   targetUserId,
          metadata: {
            impersonatorId: ctx.userId,
            targetUserId,
            tenantId,
          },
        })
      })

      // Issue tokens for the impersonation session (ipa is never true for the impersonated user)
      const accessPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
        purpose: 'access',
        sub:     targetUserId,
        sid:     impersonationSessionId,
        tid:     tenantId,
        role:    workspace.role,
        imp:     ctx.userId,
      }

      const refreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
        purpose: 'refresh',
        sub:     targetUserId,
        sid:     impersonationSessionId,
      }

      const accessToken  = fastify.jwt.sign(accessPayload,  { expiresIn: config.JWT_ACCESS_EXPIRES_IN })
      const refreshToken = fastify.jwt.sign(refreshPayload, { expiresIn: '2h' })

      reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
      return { accessToken }
    },
  })

  fastify.post('/auth/stop-impersonation', {
    schema: {
      tags:     ['auth'],
      summary:  'Stop impersonating and return to admin session',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type:       'object',
          properties: { accessToken: { type: 'string' } },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = request.ctx!

      if (!ctx.impersonatorId) {
        return reply.code(400).send({
          statusCode: 400,
          error:      'Bad Request',
          message:    'Not currently impersonating',
        })
      }

      const data = await withAdmin(async ({ repos }) => {
        // Retrieve the impersonation session to get the admin's original session ID
        const impSession = await repos.sessions.findValid(ctx.sessionId)
        if (!impSession) {
          throw Object.assign(new Error('Impersonation session not found'), { statusCode: 400 })
        }
        const sessionData = impSession.data as SessionData

        // Delete the impersonation session
        await repos.sessions.deleteById(ctx.sessionId)

        // Verify the admin's original session still exists
        const adminSessionId = sessionData.impersonatorSessionId!
        const adminSession = await repos.sessions.findValid(adminSessionId)
        if (!adminSession) {
          throw Object.assign(new Error('Admin session expired — please sign in again'), { statusCode: 401 })
        }

        // Audit log the impersonation stop
        if (impSession.tenantId) {
          await repos.auditLogs.create({
            tenantId:     impSession.tenantId,
            userId:       ctx.impersonatorId!,
            action:       'auth.impersonate_stop',
            resourceType: 'User',
            resourceId:   impSession.userId,
            metadata: {
              impersonatorId: ctx.impersonatorId,
              targetUserId:   impSession.userId,
            },
          })
        }

        const impersonator = await repos.users.findById(ctx.impersonatorId!)
        return { adminSession, adminSessionData: adminSession.data as SessionData, impersonator }
      })

      const accessPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
        purpose: 'access',
        sub:     ctx.impersonatorId!,
        sid:     data.adminSession.id,
        tid:     data.adminSession.tenantId,
        role:    data.adminSessionData.role ?? null,
        ...(data.impersonator?.isPlatformAdmin ? { ipa: true as const } : {}),
      }

      const refreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
        purpose: 'refresh',
        sub:     ctx.impersonatorId!,
        sid:     data.adminSession.id,
      }

      const accessToken  = fastify.jwt.sign(accessPayload,  { expiresIn: config.JWT_ACCESS_EXPIRES_IN  })
      const refreshToken = fastify.jwt.sign(refreshPayload, { expiresIn: config.JWT_REFRESH_EXPIRES_IN })

      reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
      return { accessToken }
    },
  })

  // ── Dev/test only ────────────────────────────────────────────────────────────
  if (config.NODE_ENV !== 'production') {
    interface DevTokenBody { email: string; name?: string }

    fastify.post('/auth/dev-token', {
      schema: {
        tags:    ['auth'],
        summary: '[DEV ONLY] Issue tokens for a test user without OAuth',
        hide:    true,
        body: {
          type:                 'object',
          required:             ['email'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email' },
            name:  { type: 'string' },
          },
        },
        response: {
          200: {
            type:       'object',
            properties: {
              accessToken: { type: 'string' },
              userId:      { type: 'string' },
            },
          },
        },
      },
      handler: async (request: FastifyRequest<{ Body: DevTokenBody }>, reply: FastifyReply) => {
        const { email, name = 'Test User' } = request.body
        let userId    = ''
        let sessionId = ''

        await withAdmin(async ({ repos }) => {
          const user = await repos.users.upsertByEmail({
            email,
            emailVerified: true,
            name,
            avatarUrl:     null,
          })
          userId = user.id

          const sessionData: SessionData = {
            role:        'member',
            planId:      '',
            planSlug:    '',
            permissions: buildPermissions('member'),
          }

          const session = await repos.sessions.create({
            userId:    user.id,
            tenantId:  null,
            data:      sessionData,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
          })
          sessionId = session.id
        })

        const accessPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
          purpose: 'access',
          sub:     userId,
          sid:     sessionId,
          tid:     null,
          role:    null,
        }

        const refreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
          purpose: 'refresh',
          sub:     userId,
          sid:     sessionId,
        }

        const accessToken  = fastify.jwt.sign(accessPayload,  { expiresIn: config.JWT_ACCESS_EXPIRES_IN  })
        const refreshToken = fastify.jwt.sign(refreshPayload, { expiresIn: config.JWT_REFRESH_EXPIRES_IN })

        reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
        return { accessToken, userId }
      },
    })
  }
}
