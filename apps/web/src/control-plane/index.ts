import { Building2, Users, Flag } from 'lucide-react'
import { ROUTES } from '@saas/config'
import type { RouteConfig, NavItem } from '@/modules/types'
import { AdminTenantsPage }      from '@/pages/admin/AdminTenantsPage'
import { AdminUsersPage }        from '@/pages/admin/AdminUsersPage'
import { AdminFeatureFlagsPage } from '@/pages/admin/AdminFeatureFlagsPage'

export const controlPlaneRoutes: RouteConfig[] = [
  { path: '/admin/tenants',       component: AdminTenantsPage },
  { path: '/admin/users',         component: AdminUsersPage },
  { path: '/admin/feature-flags', component: AdminFeatureFlagsPage },
]

export const controlPlaneNavItems: NavItem[] = [
  { href: ROUTES.adminTenants, label: 'Tenants',       icon: Building2 },
  { href: ROUTES.adminUsers,   label: 'Users',         icon: Users },
  { href: ROUTES.adminFlags,   label: 'Feature Flags', icon: Flag },
]
