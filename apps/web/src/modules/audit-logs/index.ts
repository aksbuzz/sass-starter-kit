import { ScrollText } from 'lucide-react'
import { ROUTES } from '@saas/config'
import type { WebModule } from '../types'
import { AuditLogPage } from '@/pages/AuditLogPage'

export const auditLogsModule: WebModule = {
  name: 'audit-logs',
  routes: [
    { path: '/audit-log', component: AuditLogPage },
  ],
  navItems: [
    { href: ROUTES.auditLog, label: 'Audit Log', icon: ScrollText },
  ],
}
