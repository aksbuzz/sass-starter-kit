import type { ApiModule }     from '@saas/core'
import { registerApiKeys }   from '@saas/core'
import { apiKeyRoutes }      from './routes.js'

export const apiKeysModule: ApiModule = {
  name:      'api-keys',
  container: registerApiKeys,
  routes:    apiKeyRoutes,
}
