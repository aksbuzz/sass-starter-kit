import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { RootLayout }       from './layouts/RootLayout'
import { AuthLayout }       from './layouts/AuthLayout'
import { DashboardLayout }  from './layouts/DashboardLayout'

// ── Core pages (always present) ─────────────────────────────────────────────
import { LoginPage }           from './pages/LoginPage'
import { AuthCallbackPage }    from './pages/AuthCallbackPage'
import { WorkspacePickerPage } from './pages/WorkspacePickerPage'
import { DashboardPage }       from './pages/DashboardPage'
import { SettingsPage }        from './pages/SettingsPage'

// ── Module registry ─────────────────────────────────────────────────────────
import { enabledModules }       from './modules/registry'
import { controlPlaneRoutes }   from './control-plane'

const rootRoute = createRootRoute({ component: RootLayout })

// Auth routes (public)
const authLayoutRoute   = createRoute({ getParentRoute: () => rootRoute, id: 'auth-layout', component: AuthLayout })
const loginRoute        = createRoute({ getParentRoute: () => authLayoutRoute, path: '/login', component: LoginPage })
const authCallbackRoute = createRoute({ getParentRoute: () => authLayoutRoute, path: '/auth/callback', component: AuthCallbackPage })

// Workspace picker (authenticated, no workspace selected)
const workspacePickerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/workspace-picker', component: WorkspacePickerPage })

// Dashboard layout (authenticated + workspace selected)
const dashboardLayoutRoute = createRoute({ getParentRoute: () => rootRoute, id: 'dashboard-layout', component: DashboardLayout })

// Core dashboard routes (always present)
const dashboardIndexRoute = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/', component: DashboardPage })
const settingsRoute       = createRoute({ getParentRoute: () => dashboardLayoutRoute, path: '/settings', component: SettingsPage })

// Module routes (dynamic — depends on which modules are enabled).
// We use `as any` for path/component because TanStack Router's type inference
// requires literal path types which aren't available in dynamic registration.
// The type safety is enforced at the module definition level instead.
const moduleRoutes = enabledModules.flatMap(mod =>
  mod.routes.map(r =>
    createRoute({
      getParentRoute: () => dashboardLayoutRoute,
      path: r.path as any,        // eslint-disable-line @typescript-eslint/no-explicit-any
      component: r.component as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    }),
  ),
)

// Control-plane routes (platform admin)
const cpRoutes = controlPlaneRoutes.map(r =>
  createRoute({
    getParentRoute: () => dashboardLayoutRoute,
    path: r.path as any,        // eslint-disable-line @typescript-eslint/no-explicit-any
    component: r.component as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  }),
)

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([loginRoute, authCallbackRoute]),
  workspacePickerRoute,
  dashboardLayoutRoute.addChildren([
    dashboardIndexRoute,
    settingsRoute,
    ...moduleRoutes,
    ...cpRoutes,
  ]),
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
