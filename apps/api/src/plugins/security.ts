import type { FastifyInstance } from 'fastify'
import fastifyHelmet from '@fastify/helmet'
import fastifyCors   from '@fastify/cors'
import { config }    from '../config.js'

export async function registerSecurity(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", 'data:', 'https:'],
        connectSrc:     ["'self'"],
        fontSrc:        ["'self'"],
        objectSrc:      ["'none'"],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: config.NODE_ENV === 'production',
  })

  await fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Postman, same-origin)
      if (!origin) return cb(null, true)
      // In production restrict to the known frontend URL
      if (config.NODE_ENV === 'production') {
        return cb(null, origin === config.WEB_URL)
      }
      // In development allow any localhost origin
      return cb(null, /^https?:\/\/localhost(:\d+)?$/.test(origin))
    },
    credentials: true,  // required for cookies (refresh token)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
  })
}
