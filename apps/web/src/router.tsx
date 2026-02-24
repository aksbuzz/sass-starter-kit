import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { RootLayout }       from './layouts/RootLayout'
import { AuthLayout }       from './layouts/AuthLayout'
import { DashboardLayout }  from './layouts/DashboardLayout'
import { LoginPage }        from './pages/LoginPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { WorkspacePickerPage } from './pages/WorkspacePickerPage'
import { DashboardPage }    from './pages/DashboardPage'
import { TeamPage }         from './pages/TeamPage'
import { ApiKeysPage }      from './pages/ApiKeysPage'
import { BillingPage }      from './pages/BillingPage'
import { SettingsPage }     from './pages/SettingsPage'
import { WebhooksPage }     from './pages/WebhooksPage'
import { AuditLogPage }     from './pages/AuditLogPage'
import { FeatureFlagsPage } from './pages/FeatureFlagsPage'

const rootRoute = createRootRoute({ component: RootLayout })

const authLayoutRoute = createRoute({ getParentRoute: () => rootRoute, id: 'auth-layout', component: AuthLayout })
const loginRoute        = createRoute({ getParentRoute: () => authLayoutRoute, path: '/login', component: LoginPage })
const authCallbackRoute = createRoute({ getParentRoute: () => authLayoutRoute, path: '/auth/callback', component: AuthCallbackPage })

const workspacePickerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/workspace-picker', component: WorkspacePickerPage })

const dashboardLayoutRoute = createRoute({ getParentRoute: () => rootRoute, id: 'dashboard-layout', component: DashboardLayout })
const dashboardIndexRoute  = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/', component: DashboardPage })
const teamRoute            = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/team', component: TeamPage })
const apiKeysRoute         = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/api-keys', component: ApiKeysPage })
const billingRoute         = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/billing', component: BillingPage })
const settingsRoute        = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/settings', component: SettingsPage })
const webhooksRoute        = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/webhooks', component: WebhooksPage })
const auditLogRoute        = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/audit-log', component: AuditLogPage })
const featureFlagsRoute    = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/feature-flags', component: FeatureFlagsPage })

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([loginRoute, authCallbackRoute]),
  workspacePickerRoute,
  dashboardLayoutRoute.addChildren([
    dashboardIndexRoute, teamRoute, apiKeysRoute, billingRoute,
    settingsRoute, webhooksRoute, auditLogRoute, featureFlagsRoute,
  ]),
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
