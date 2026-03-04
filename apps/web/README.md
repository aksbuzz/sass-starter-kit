# @saas/web — React Frontend

React 18 + Vite + TanStack Router frontend. Serves both the tenant-facing app and the platform admin control plane.

## Scripts

```bash
pnpm dev        # start dev server (Vite HMR)
pnpm build      # compile to dist/
pnpm preview    # preview production build
pnpm test:e2e   # run Playwright E2E tests
pnpm lint       # eslint
```

## Architecture

Mirrors the API's three-layer structure:

```
src/
  core/                ← always-on pages and components
    pages/             ← LoginPage, AuthCallbackPage, WorkspacePickerPage, DashboardPage
    components/        ← AuthGuard, Sidebar, layout shells

  control-plane/       ← platform admin pages (requirePlatformAdmin)
    index.ts           ← exports controlPlaneRoutes + controlPlaneNavItems

  modules/             ← opt-in feature modules
    types.ts           ← WebModule interface { name, routes, navItems }
    registry.ts        ← enabledModules[] — comment out to disable a module
    team/
    billing/
    api-keys/
    webhooks/
    feature-flags/
    audit-logs/

  router.tsx           ← builds route tree from core + control-plane + modules
  lib/
    api/               ← typed fetch client
    store/             ← Redux auth slice
    hooks/             ← useAuth, useToast
```

## Module system

Each module exports a `WebModule`:

```typescript
export interface WebModule {
  name:     string
  routes:   RouteConfig[]   // { path, component }
  navItems: NavItem[]       // { href, label, icon }
}
```

`modules/registry.ts` is the single place to enable/disable modules. The router and sidebar read from this registry at startup — disabling a module removes its routes and nav entry automatically.

## Adding a module

1. Create `src/modules/<name>/index.ts`:

```typescript
import { MyPage }   from './pages/MyPage.js'
import { MyIcon }   from 'lucide-react'
import { ROUTES }   from '@saas/config'
import type { WebModule } from '../types.js'

export const myModule: WebModule = {
  name: 'my-module',
  routes: [
    { path: ROUTES.myPage, component: MyPage },
  ],
  navItems: [
    { href: ROUTES.myPage, label: 'My Feature', icon: MyIcon },
  ],
}
```

2. Add `myModule` to `src/modules/registry.ts`
3. Add the route constant to `packages/config/src/constants.ts`

## Disabling a module

Comment it out in `src/modules/registry.ts`:

```typescript
export const enabledModules: WebModule[] = [
  teamModule,
  // billingModule,  ← disabled: page route and sidebar entry are removed
  apiKeysModule,
]
```

## Auth flow

1. User visits `/login` → clicks OAuth button → redirected to provider
2. Provider redirects to `/auth/callback?code=...`
3. `AuthCallbackPage` exchanges the code for tokens, stores the access token in Redux, sets a session cookie
4. If `ipa` claim is set → redirect to `/admin/tenants` (control plane)
5. Otherwise → redirect to `/workspace-picker`
6. Workspace selection calls `POST /auth/workspace` → new token with `tenantId + role` → redirect to `/`

## E2E tests (Playwright)

Live in `playwright/`. Require the API server to be running.

```bash
pnpm test:e2e
```

| Path | Contents |
|------|---------|
| `playwright/tests/` | Spec files (one per page) |
| `playwright/fixtures/auth.ts` | JWT creation + auth state setup |
| `playwright/helpers/mock-api.ts` | API route mocking helpers |
