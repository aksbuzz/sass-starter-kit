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
    if (auth.status === 'authenticated' && !auth.tenantId) {
      navigate({ to: ROUTES.workspacePicker, replace: true });
    }
  }, [auth.status, auth.tenantId, navigate])

  if (auth.status === 'idle' || auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (auth.status !== 'authenticated' || !auth.tenantId) return null

  return <>{children}</>
}
