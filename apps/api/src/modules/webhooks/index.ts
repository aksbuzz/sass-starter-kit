import type { ApiModule }      from '@saas/core'
import { registerWebhooks }   from '@saas/core'
import { webhookRoutes }      from './routes.js'

export const webhooksModule: ApiModule = {
  name:      'webhooks',
  container: registerWebhooks,
  routes:    webhookRoutes,
}
