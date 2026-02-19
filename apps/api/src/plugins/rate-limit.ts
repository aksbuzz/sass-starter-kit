import type { FastifyInstance } from 'fastify'
import fastifyRateLimit from '@fastify/rate-limit'
import { config } from '../config.js'

// uses an in-process sliding window store.
export async function registerRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyRateLimit, {
    global:      true,
    max:         config.RATE_LIMIT_MAX,  // override via RATE_LIMIT_MAX env var for load testing
    timeWindow:  '1 minute',
    skipOnError: false,
    keyGenerator: (request) => {
      return request.ip
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode:  429,
      error:       'Too Many Requests',
      message:     `Rate limit exceeded. Retry after ${Math.ceil(context.ttl / 1000)}s`,
      retryAfter:  Math.ceil(context.ttl / 1000),
    }),
  })
}
