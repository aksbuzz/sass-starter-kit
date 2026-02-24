'use client'

import { useMutation } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { API_PATHS } from '@saas/config'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
  Button, Badge, Separator,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { Subscription } from '@/lib/api/types'

interface Props {
  subscription: Subscription | null
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'destructive' | 'default' | 'outline'> = {
  active:     'success',
  trialing:   'warning',
  past_due:   'destructive',
  canceled:   'destructive',
  unpaid:     'destructive',
  incomplete: 'outline',
}

export function BillingCard({ subscription }: Props) {
  const { toast } = useToast()

  const checkoutMutation = useMutation({
    mutationFn: (priceId: string) =>
      api.post<{ url: string }>(API_PATHS.billing.checkout, { priceId, billingCycle: 'monthly' }),
    onSuccess: (res) => { window.location.href = res.url },
    onError:   () => toast({ title: 'Error', description: 'Could not start checkout', variant: 'destructive' }),
  })

  const portalMutation = useMutation({
    mutationFn: () => api.post<{ url: string }>(API_PATHS.billing.portal),
    onSuccess:  (res) => { window.location.href = res.url },
    onError:    () => toast({ title: 'Error', description: 'Could not open billing portal', variant: 'destructive' }),
  })

  const plan   = subscription?.plan
  const status = subscription?.status ?? 'none'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{plan?.name ?? 'No subscription'}</CardTitle>
            <CardDescription className="capitalize">{plan?.slug}</CardDescription>
          </div>
          <Badge variant={STATUS_BADGE[status] ?? 'outline'} className="capitalize">{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {subscription?.trialEndsAt && (
          <p className="text-sm">
            Trial ends: <span className="font-medium">{format(parseISO(subscription.trialEndsAt), 'MMM d, yyyy')}</span>
          </p>
        )}
        {subscription?.currentPeriodEnd && (
          <p className="text-sm">
            Next renewal: <span className="font-medium">{format(parseISO(subscription.currentPeriodEnd), 'MMM d, yyyy')}</span>
          </p>
        )}
        {plan && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Max members</span>
              <span className="font-medium">{plan.limits.maxMembers ?? 'Unlimited'}</span>
              <span className="text-muted-foreground">Max API keys</span>
              <span className="font-medium">{plan.limits.maxApiKeys}</span>
              <span className="text-muted-foreground">Max webhooks</span>
              <span className="font-medium">{plan.limits.maxWebhooks}</span>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {subscription && (
          <Button variant="outline" disabled={portalMutation.isPending} onClick={() => portalMutation.mutate()}>
            {portalMutation.isPending ? 'Loading…' : 'Manage billing'}
          </Button>
        )}
        {(!subscription || status === 'trialing' || status === 'canceled') && (
          <Button disabled={checkoutMutation.isPending} onClick={() => checkoutMutation.mutate('price_placeholder')}>
            {checkoutMutation.isPending ? 'Loading…' : 'Upgrade plan'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
