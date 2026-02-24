'use client'

import { differenceInDays, parseISO } from 'date-fns'
import { Users, CreditCard, Key, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@saas/ui'
import type { WorkspaceContext } from '@/lib/api/types'

export function OverviewCards({ ctx }: { ctx: WorkspaceContext }) {
  const { tenant, subscription, memberCount, flags } = ctx
  const plan = subscription?.plan

  const trialDays = subscription?.trialEndsAt
    ? Math.max(0, differenceInDays(parseISO(subscription.trialEndsAt), new Date()))
    : null

  const statusVariant = (s: string) =>
    s === 'active' ? 'success' : s === 'trialing' ? 'warning' : 'destructive'

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Plan */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Current plan</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold capitalize">{plan?.name ?? '—'}</p>
          {subscription && (
            <Badge variant={statusVariant(subscription.status) as 'success' | 'warning' | 'destructive'} className="mt-1">
              {subscription.status}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Members</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{memberCount}</p>
          {plan?.limits.maxMembers && (
            <p className="text-xs text-muted-foreground mt-1">of {plan.limits.maxMembers} max</p>
          )}
        </CardContent>
      </Card>

      {/* Trial */}
      {trialDays !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Trial ends in</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{trialDays}</p>
            <p className="text-xs text-muted-foreground mt-1">days remaining</p>
          </CardContent>
        </Card>
      )}

      {/* API access */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">API access</CardTitle>
          <Key className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-sm font-semibold">
            {flags['api_access']?.enabled ? 'Enabled' : 'Disabled'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Max {plan?.limits.maxApiKeys ?? '—'} keys</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function FlagChips({ flags }: { flags: WorkspaceContext['flags'] }) {
  const entries = Object.entries(flags)
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key, flag]) => (
        <Badge key={key} variant={flag.enabled ? 'success' : 'outline'} className="capitalize">
          {key.replace(/_/g, ' ')}
        </Badge>
      ))}
    </div>
  )
}
