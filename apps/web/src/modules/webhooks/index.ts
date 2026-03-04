import { Webhook } from 'lucide-react'
import { ROUTES } from '@saas/config'
import type { WebModule } from '../types'
import { WebhooksPage } from '@/pages/WebhooksPage'

export const webhooksModule: WebModule = {
  name: 'webhooks',
  routes: [
    { path: '/webhooks', component: WebhooksPage },
  ],
  navItems: [
    { href: ROUTES.webhooks, label: 'Webhooks', icon: Webhook },
  ],
}
