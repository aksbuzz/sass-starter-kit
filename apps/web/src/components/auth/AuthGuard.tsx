import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router';
import { ROUTES } from '@saas/config'
import { useAuth } from '@/lib/hooks/useAuth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const auth   = useAuth()

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      navigate({ to: ROUTES.login, replace: true });
    }
    // Platform admins don't select workspaces — send them to admin panel
    if (auth.status === 'authenticated' && !auth.tenantId && !auth.isPlatformAdmin) {
      navigate({ to: ROUTES.workspacePicker, replace: true });
    }
  }, [auth.status, auth.tenantId, auth.isPlatformAdmin, navigate])

  if (auth.status === 'idle' || auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (auth.status !== 'authenticated') return null
  if (!auth.tenantId && !auth.isPlatformAdmin) return null

  return <>{children}</>
}
