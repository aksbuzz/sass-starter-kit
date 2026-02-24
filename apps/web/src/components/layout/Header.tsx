import { useNavigate } from '@tanstack/react-router'
import { LogOut, ChevronDown } from 'lucide-react'
import { API_PATHS, ROUTES, SESSION_COOKIE_NAME } from '@saas/config'
import {
  Avatar, AvatarFallback,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  Button,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/lib/store/auth.slice'

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const auth   = useAuthStore()

  const initials = auth.userId ? auth.userId.slice(0, 2).toUpperCase() : '?'

  const handleLogout = async () => {
    try {
      await api.delete(API_PATHS.auth.logout)
    } catch { /* ignore */ }
    auth.clearToken()
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0`
    navigate({ to: ROUTES.login, replace: true });
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <h1 className="text-lg font-semibold">{title}</h1>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 px-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
            {auth.role ?? 'member'}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
