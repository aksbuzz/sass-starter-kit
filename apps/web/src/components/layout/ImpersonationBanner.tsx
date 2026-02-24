import { useAuthStore } from '../../lib/store/auth.slice'
import { api } from '../../lib/api/client'
import { API_PATHS } from '@saas/config'
import { Button } from '@saas/ui'

export function ImpersonationBanner() {
  const impersonatorId = useAuthStore((s) => s.impersonatorId)
  const setToken       = useAuthStore((s) => s.setToken)
  const clearToken     = useAuthStore((s) => s.clearToken)

  if (!impersonatorId) return null

  const handleStop = async () => {
    try {
      const res = await api.post<{ accessToken: string }>(API_PATHS.auth.stopImpersonation)
      setToken(res.accessToken)
    } catch {
      clearToken()
    }
  }

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <span>You are impersonating a user. All actions are being recorded.</span>
      <Button
        variant="outline"
        size="sm"
        onClick={handleStop}
        className="border-black text-black hover:bg-amber-600"
      >
        Stop Impersonating
      </Button>
    </div>
  )
}
