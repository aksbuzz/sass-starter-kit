import type { ApiModule } from '@saas/core'
import { teamModule }         from './team/index.js'
import { billingModule }      from './billing/index.js'
import { apiKeysModule }      from './api-keys/index.js'
import { webhooksModule }     from './webhooks/index.js'
import { featureFlagsModule } from './feature-flags/index.js'
import { auditLogsModule }    from './audit-logs/index.js'

// ─── Toggle modules by commenting/uncommenting ─────────────────────────────
export const enabledModules: ApiModule[] = [
  teamModule,
  billingModule,
  apiKeysModule,
  webhooksModule,
  featureFlagsModule,
  auditLogsModule,
]
