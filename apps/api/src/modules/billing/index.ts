import type { ApiModule }    from '@saas/core'
import { registerBilling }  from '@saas/core'
import { billingRoutes }    from './routes.js'

export const billingModule: ApiModule = {
  name:      'billing',
  container: registerBilling,
  routes:    billingRoutes,
}
