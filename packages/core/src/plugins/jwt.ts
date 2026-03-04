import type { FastifyInstance } from 'fastify'
import fastifyJwt  from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import { config }  from '../config.js'

export async function registerJwt(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyCookie)

  await fastify.register(fastifyJwt, {
    secret:    config.JWT_SECRET,
    // Access token location: Authorization: Bearer <token>
    // Refresh token location: httpOnly cookie
    cookie: {
      cookieName: 'refresh_token',
      signed: false,
    },
  })
}

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path:     '/auth/refresh',
  maxAge:   7 * 24 * 60 * 60, // 7 days
} as const
