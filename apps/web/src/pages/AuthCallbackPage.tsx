import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ROUTES, API_PATHS, SESSION_COOKIE_NAME } from '@saas/config'
import { useAuthStore, decodeToken } from '@/lib/store/auth.slice'
import { api } from '@/lib/api/client'

export function AuthCallbackPage() {
  const navigate  = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const code = new URL(window.location.href).searchParams.get('code');
    if (!code) {
      navigate({ to: ROUTES.login, replace: true });
      return;
    }
    api
      .post<{ accessToken: string }>(API_PATHS.auth.exchange, { code })
      .then(res => {
        useAuthStore.getState().setToken(res.accessToken);
        document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
        const payload = decodeToken(res.accessToken);
        navigate({ to: (payload?.ipa ? ROUTES.adminTenants : ROUTES.workspacePicker) as string, replace: true });
      })
      .catch(() => navigate({ to: ROUTES.login, replace: true }));
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="mt-4 text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  )
}
