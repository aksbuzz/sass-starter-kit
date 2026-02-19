import { createHash }            from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'

/**
 * Computes a weak ETag from a JSON-serialisable body.
 * Uses the first 16 hex chars of a SHA-1 digest — collision probability is
 * negligible for this use-case and it keeps the header short.
 */
export function computeEtag(body: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16)
  return `"${hash}"`
}

/**
 * Sets ETag + Cache-Control headers and conditionally short-circuits with 304.
 *
 * Usage in a route handler:
 *   const body = { items }
 *   return replyWithEtag(request, reply, body)
 *
 * `Cache-Control: private, no-cache` tells the browser to store the response
 * but always revalidate via If-None-Match before using it — the right semantic
 * for authenticated API endpoints.
 */
export function replyWithEtag(
  request: FastifyRequest,
  reply:   FastifyReply,
  body:    unknown,
): FastifyReply {
  const etag = computeEtag(body)
  reply.header('ETag', etag)
  reply.header('Cache-Control', 'private, no-cache')

  if (request.headers['if-none-match'] === etag) {
    return reply.code(304).send()
  }

  return reply.send(body)
}
