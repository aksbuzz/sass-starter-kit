'use client'

import { useMutation } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
  Button, Badge,
} from '@saas/ui'
import { Check } from 'lucide-react'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { Plan } from '@/lib/api/types'

interface Props {
  plans:           Plan[]
  currentPlanSlug: string | undefined
}

export function PlanCards({ plans, currentPlanSlug }: Props) {
  const { toast } = useToast()

  const checkoutMutation = useMutation({
    mutationFn: (priceId: string) =>
      api.post<{ url: string }>(API_PATHS.billing.checkout, { priceId, billingCycle: 'monthly' }),
    onSuccess: (res) => { window.location.href = res.url },
    onError:   () => toast({ title: 'Error', description: 'Could not start checkout', variant: 'destructive' }),
  })

  const formatPrice = (cents: number | null) =>
    cents == null ? 'Custom' : cents === 0 ? 'Free' : `$${(cents / 100).toFixed(0)}/mo`

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map(plan => {
        const isCurrent = plan.slug === currentPlanSlug
        return (
          <Card key={plan.id} className={isCurrent ? 'border-primary ring-1 ring-primary' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                {isCurrent && <Badge>Current</Badge>}
              </div>
              <CardDescription className="text-2xl font-bold text-foreground">
                {formatPrice(plan.priceMonthlyCents)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                plan.limits.maxMembers != null && `Up to ${plan.limits.maxMembers} members`,
                `${plan.limits.maxApiKeys} API keys`,
                plan.features.sso && 'SSO',
                plan.features.webhooks && 'Webhooks',
                plan.features.advancedAnalytics && 'Advanced analytics',
                plan.features.prioritySupport && 'Priority support',
              ].filter(Boolean).map((feature, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 shrink-0" />
                  <span>{feature as string}</span>
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={isCurrent ? 'outline' : 'default'}
                disabled={isCurrent || !plan.priceMonthlyCents || checkoutMutation.isPending}
                onClick={() => plan.priceMonthlyCents && checkoutMutation.mutate(`plan_${plan.slug}`)}
              >
                {isCurrent ? 'Current plan' : plan.priceMonthlyCents ? 'Upgrade' : 'Contact us'}
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
