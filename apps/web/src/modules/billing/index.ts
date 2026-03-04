import { CreditCard } from 'lucide-react'
import { ROUTES } from '@saas/config'
import type { WebModule } from '../types'
import { BillingPage } from '@/pages/BillingPage'

export const billingModule: WebModule = {
  name: 'billing',
  routes: [
    { path: '/billing', component: BillingPage },
  ],
  navItems: [
    { href: ROUTES.billing, label: 'Billing', icon: CreditCard },
  ],
}
