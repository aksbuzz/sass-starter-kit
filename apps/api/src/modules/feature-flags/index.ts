import type { ApiModule }          from '@saas/core'
import { registerFeatureFlags }   from '@saas/core'
import { featureFlagRoutes }      from './routes.js'

export const featureFlagsModule: ApiModule = {
  name:      'feature-flags',
  container: registerFeatureFlags,
  routes:    featureFlagRoutes,
}
