import { Users } from 'lucide-react'
import { ROUTES } from '@saas/config'
import type { WebModule } from '../types'
import { TeamPage } from '@/pages/TeamPage'

export const teamModule: WebModule = {
  name: 'team',
  routes: [
    { path: '/team', component: TeamPage },
  ],
  navItems: [
    { href: ROUTES.team, label: 'Team', icon: Users },
  ],
}
