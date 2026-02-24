'use client'

import { useQuery } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Badge, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import type { WebhookDelivery } from '@/lib/api/types'

interface Props {
  endpointId: string
}

export function DeliveryHistory({ endpointId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', endpointId],
    queryFn:  () =>
      api.get<{ deliveries: WebhookDelivery[] }>(API_PATHS.webhooks.deliveries(endpointId)),
  })

  const deliveries = data?.deliveries ?? []

  const statusVariant = (code: number | null): 'success' | 'destructive' | 'warning' => {
    if (code == null) return 'warning'
    if (code >= 200 && code < 300) return 'success'
    return 'destructive'
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    )
  }

  if (deliveries.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No deliveries yet
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Attempt</TableHead>
          <TableHead>Delivered</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.map(d => (
          <TableRow key={d.id}>
            <TableCell className="font-mono text-xs">{d.eventType}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(d.statusCode)}>
                {d.statusCode ?? 'Failed'}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {d.durationMs != null ? `${d.durationMs}ms` : '—'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">#{d.attempt}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {d.deliveredAt ? new Date(d.deliveredAt).toLocaleString() : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
