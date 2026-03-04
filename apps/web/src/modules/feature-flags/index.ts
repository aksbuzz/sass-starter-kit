import { Flag } from 'lucide-react'
import { ROUTES } from '@saas/config'
import type { WebModule } from '../types'
import { FeatureFlagsPage } from '@/pages/FeatureFlagsPage'

export const featureFlagsModule: WebModule = {
  name: 'feature-flags',
  routes: [
    { path: '/feature-flags', component: FeatureFlagsPage },
  ],
  navItems: [
    { href: ROUTES.featureFlags, label: 'Feature Flags', icon: Flag },
  ],
}
