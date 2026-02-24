import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import { Button, Card, CardContent, Skeleton } from '@saas/ui'
import { Plus } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { WebhookTable } from '@/components/webhooks/WebhookTable'
import { CreateWebhookDialog } from '@/components/webhooks/CreateWebhookDialog'
import { api } from '@/lib/api/client'
import type { WebhookEndpoint } from '@/lib/api/types'

export function WebhooksPage() {
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['webhooks'],
    queryFn:  () => api.get<{ endpoints: WebhookEndpoint[] }>(API_PATHS.webhooks.list),
  })

  const endpoints = data?.endpoints ?? []

  return (
    <div className="flex flex-col h-full">
      <Header title="Webhooks" />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add webhook
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </CardContent>
          </Card>
        ) : isError ? (
          <Card><CardContent className="p-6 text-sm text-destructive">Failed to load webhooks. Please refresh.</CardContent></Card>
        ) : endpoints.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              No webhooks yet. Add one to start receiving events.
            </CardContent>
          </Card>
        ) : (
          <WebhookTable endpoints={endpoints} />
        )}
      </div>

      <CreateWebhookDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
