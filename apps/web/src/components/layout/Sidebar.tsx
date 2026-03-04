import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, Settings, Shield } from 'lucide-react'
import { ROUTES } from '@saas/config'
import { cn } from '@saas/ui'
import { useAuthStore } from '@/lib/store/auth.slice'
import { enabledModules }        from '@/modules/registry'
import { controlPlaneNavItems }  from '@/control-plane'

// Core nav items (always shown regardless of enabled modules)
const CORE_NAV = [
  { href: ROUTES.dashboard, label: 'Dashboard', icon: LayoutDashboard },
]

// Module nav items (dynamic based on enabled modules)
const MODULE_NAV = enabledModules.flatMap(m => m.navItems)

// Settings is always last in the main nav
const SETTINGS_NAV = [
  { href: ROUTES.settings, label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname        = useRouterState({ select: (s) => s.location.pathname as string })
  const isPlatformAdmin = useAuthStore(s => s.isPlatformAdmin)

  const navLink = (href: string, label: string, Icon: React.ElementType) => {
    const isActive = href === ROUTES.dashboard ? pathname === href : pathname.startsWith(href)
    return (
      <li key={href}>
        <Link
          to={href}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      </li>
    )
  }

  return (
    <aside className="flex h-screen w-56 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
          S
        </div>
        <span className="font-semibold text-sidebar-foreground">SaaS Kit</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-0.5 px-3">
          {CORE_NAV.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
          {MODULE_NAV.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
          {SETTINGS_NAV.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
        </ul>

        {isPlatformAdmin && (
          <div className="mt-4 px-3">
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
              <Shield className="h-3 w-3" />
              Platform Admin
            </div>
            <ul className="mt-1 space-y-0.5">
              {controlPlaneNavItems.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  )
}
