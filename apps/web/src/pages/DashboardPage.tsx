
import { useQuery } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton,
} from '@saas/ui'
import { Header } from '@/components/layout/Header'
import { OverviewCards, FlagChips } from '@/components/dashboard/OverviewCards'
import { api } from '@/lib/api/client'
import type { WorkspaceContext } from '@/lib/api/types'

export function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspace'],
    queryFn:  () => api.get<WorkspaceContext>(API_PATHS.tenants.me),
  })

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 p-6 space-y-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : isError ? (
          <Card><CardContent className="p-6 text-sm text-destructive">Failed to load dashboard data. Please refresh.</CardContent></Card>
        ) : data ? (
          <>
            <OverviewCards ctx={data} />
            <Card>
              <CardHeader>
                <CardTitle>Feature flags</CardTitle>
                <CardDescription>Active features on your current plan</CardDescription>
              </CardHeader>
              <CardContent>
                <FlagChips flags={data.flags} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{data.tenant.name}</CardTitle>
                <CardDescription>/{data.tenant.slug}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>Your role: <span className="font-medium text-foreground capitalize">{data.membership.role}</span></p>
                <p className="mt-1">Isolation: <span className="font-medium text-foreground">{data.tenant.isolationMode}</span></p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}
