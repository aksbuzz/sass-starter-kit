import { useQuery } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import { Card, CardContent, Skeleton } from '@saas/ui'
import { Header } from '@/components/layout/Header'
import { BillingCard } from '@/components/billing/BillingCard'
import { PlanCards } from '@/components/billing/PlanCards'
import { api } from '@/lib/api/client'
import type { Plan, Subscription } from '@/lib/api/types'

export function BillingPage() {
  const { data: subData, isLoading: subLoading, isError: subError } = useQuery({
    queryKey: ['billing'],
    queryFn:  () => api.get<{ subscription: Subscription | null }>(API_PATHS.billing.subscription),
  })

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn:  () => api.get<{ plans: Plan[] }>(API_PATHS.billing.plans),
  })

  return (
    <div className="flex flex-col h-full">
      <Header title="Billing" />
      <div className="flex-1 p-6 space-y-8">
        {/* Current subscription */}
        {subLoading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
        ) : subError ? (
          <Card><CardContent className="p-6 text-sm text-destructive">Failed to load subscription data. Please refresh.</CardContent></Card>
        ) : (
          <BillingCard subscription={subData?.subscription ?? null} />
        )}

        {/* Available plans */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Available plans</h2>
          {plansLoading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <PlanCards
              plans={plansData?.plans ?? []}
              currentPlanSlug={subData?.subscription?.plan.slug}
            />
          )}
        </div>
      </div>
    </div>
  )
}
