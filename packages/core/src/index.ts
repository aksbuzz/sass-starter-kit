// ── Config ────────────────────────────────────────────────────────────────
export { config, type Config } from './config.js'

// ── Types ─────────────────────────────────────────────────────────────────
export type { RequestContext, AccessTokenPayload, RefreshTokenPayload } from './types.js'
export type { ApiModule } from './modules/types.js'

// ── DI Tokens ─────────────────────────────────────────────────────────────
export { TOKENS } from './container/tokens.js'

// ── Container builder ─────────────────────────────────────────────────────
export { buildCoreContainer } from './container/core.js'

// ── Binding registrars ────────────────────────────────────────────────────
export { registerControlPlane } from './bindings/admin.js'
export { registerTeam }         from './bindings/team.js'
export { registerBilling }      from './bindings/billing.js'
export { registerApiKeys }      from './bindings/api-keys.js'
export { registerWebhooks }     from './bindings/webhooks.js'
export { registerFeatureFlags } from './bindings/feature-flags.js'
export { registerAuditLogs }    from './bindings/audit-logs.js'

// ── Services ──────────────────────────────────────────────────────────────
export { AuthService, type OAuthProvider } from './services/auth.service.js'
export { TenantService }      from './services/tenant.service.js'
export { AdminService }       from './services/admin.service.js'
export { TeamService }        from './services/team.service.js'
export { BillingService }     from './services/billing.service.js'
export { ApiKeyService }      from './services/api-key.service.js'
export { WebhookService }     from './services/webhook.service.js'
export { FeatureFlagService } from './services/feature-flag.service.js'
export { AuditLogService }    from './services/audit-log.service.js'

// ── Hooks ─────────────────────────────────────────────────────────────────
export { authenticate }          from './hooks/authenticate.js'
export { requireRole }           from './hooks/require-role.js'
export { requirePlatformAdmin }  from './hooks/require-platform-admin.js'

// ── Shared Fastify app factory ────────────────────────────────────────────
export { createBaseApp } from './app.js'

// ── Plugins ───────────────────────────────────────────────────────────────
export { registerPlugins } from './plugins/index.js'
export { REFRESH_COOKIE_OPTIONS } from './plugins/jwt.js'

// ── Lib utilities ─────────────────────────────────────────────────────────
export { auditMeta }    from './lib/audit-helpers.js'
export { encrypt, decrypt } from './lib/crypto.js'
export { sendEmail, type EmailMessage } from './lib/email.js'
export { computeEtag, replyWithEtag } from './lib/etag.js'
export {
  httpRequestDuration,
  httpRequestsTotal,
  jobProcessedTotal,
  jobProcessingDuration,
  jobActiveCount,
  registry as metricsRegistry,
} from './lib/metrics.js'
export { initDbMetrics } from './lib/metrics-hooks.js'
export { notify }        from './lib/notify.js'
export { google as googleOAuth, github as githubOAuth, type OAuthProfile } from './lib/oauth.js'
export { buildPermissions } from './lib/permissions.js'

// ── Job worker ────────────────────────────────────────────────────────────
export {
  JobWorker,
  type JobHandler,
  type HandlerRegistry,
  type JobWorkerOptions,
} from './worker/job-worker.js'
