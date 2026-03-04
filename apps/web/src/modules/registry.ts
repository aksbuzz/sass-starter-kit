import type { WebModule } from './types'
import { teamModule }         from './team'
import { billingModule }      from './billing'
import { apiKeysModule }      from './api-keys'
import { webhooksModule }     from './webhooks'
import { featureFlagsModule } from './feature-flags'
import { auditLogsModule }    from './audit-logs'

// ─── Toggle modules by commenting/uncommenting ─────────────────────────────
export const enabledModules: WebModule[] = [
  teamModule,
  billingModule,
  apiKeysModule,
  webhooksModule,
  featureFlagsModule,
  auditLogsModule,
]
