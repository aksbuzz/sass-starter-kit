import { useQuery } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import { Card, CardContent, Skeleton } from '@saas/ui'
import { Header } from '@/components/layout/Header'
import { GeneralSettings } from '@/components/settings/GeneralSettings'
import { DangerZone } from '@/components/settings/DangerZone'
import { api } from '@/lib/api/client'
import type { WorkspaceContext } from '@/lib/api/types'

export function SettingsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspace'],
    queryFn:  () => api.get<WorkspaceContext>(API_PATHS.tenants.me),
  })

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" />
      <div className="flex-1 p-6 space-y-8 max-w-2xl">
        {isLoading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        ) : isError ? (
          <Card><CardContent className="p-6 text-sm text-destructive">Failed to load settings. Please refresh.</CardContent></Card>
        ) : data ? (
          <>
            <GeneralSettings tenant={data.tenant} />
            <DangerZone workspaceName={data.tenant.name} />
          </>
        ) : null}
      </div>
    </div>
  )
}
