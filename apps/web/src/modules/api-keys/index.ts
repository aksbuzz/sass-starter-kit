import { Key } from 'lucide-react'
import { ROUTES } from '@saas/config'
import type { WebModule } from '../types'
import { ApiKeysPage } from '@/pages/ApiKeysPage'

export const apiKeysModule: WebModule = {
  name: 'api-keys',
  routes: [
    { path: '/api-keys', component: ApiKeysPage },
  ],
  navItems: [
    { href: ROUTES.apiKeys, label: 'API Keys', icon: Key },
  ],
}
