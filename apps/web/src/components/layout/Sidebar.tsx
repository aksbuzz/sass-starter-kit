import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard, Users, Key, CreditCard, Settings, Webhook, ScrollText, Flag,
} from 'lucide-react'
import { ROUTES } from '@saas/config'
import { cn } from '@saas/ui'

const NAV_ITEMS = [
  { href: ROUTES.dashboard, label: 'Dashboard',  icon: LayoutDashboard },
  { href: ROUTES.team,      label: 'Team',        icon: Users },
  { href: ROUTES.apiKeys,   label: 'API Keys',    icon: Key },
  { href: ROUTES.billing,   label: 'Billing',     icon: CreditCard },
  { href: ROUTES.webhooks,     label: 'Webhooks',      icon: Webhook },
  { href: ROUTES.featureFlags, label: 'Feature Flags', icon: Flag },
  { href: ROUTES.auditLog,     label: 'Audit Log',     icon: ScrollText },
  { href: ROUTES.settings,  label: 'Settings',    icon: Settings },
]

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname as string })

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
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
          })}
        </ul>
      </nav>
    </aside>
  )
}
