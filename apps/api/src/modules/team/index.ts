import type { ApiModule } from '@saas/core'
import { registerTeam }  from '@saas/core'
import { teamRoutes }    from './routes.js'

export const teamModule: ApiModule = {
  name:      'team',
  container: registerTeam,
  routes:    teamRoutes,
}
