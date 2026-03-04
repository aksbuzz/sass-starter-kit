import type { RequestContext } from '../types.js'

/**
 * Returns impersonation metadata for audit logs when the request
 * is made during an impersonation session. Returns empty object otherwise.
 */
export function auditMeta(ctx: RequestContext): Record<string, unknown> {
  if (ctx.impersonatorId) {
    return { impersonatedBy: ctx.impersonatorId }
  }
  return {}
}
