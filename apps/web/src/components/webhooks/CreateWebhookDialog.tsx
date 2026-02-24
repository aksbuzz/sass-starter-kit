'use client'

import { SetStateAction, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS, WEBHOOK_EVENTS } from '@saas/config'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, Input, Label, Badge,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { WebhookEndpoint } from '@/lib/api/types'

interface Props {
  open:    boolean
  onClose: () => void
}

export function CreateWebhookDialog({ open, onClose }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const [url, setUrl]         = useState('')
  const [events, setEvents]   = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ endpoint: WebhookEndpoint }>(API_PATHS.webhooks.create, { url, events }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      toast({ title: 'Webhook created' })
      handleClose()
    },
    onError: (err: unknown) =>
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create webhook',
        variant: 'destructive',
      }),
  })

  const toggleEvent = (event: string) =>
    setEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event],
    )

  const handleClose = () => {
    setUrl('')
    setEvents([])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create webhook</DialogTitle>
          <DialogDescription>Receive HTTP POST events at your URL</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">Endpoint URL</Label>
            <Input
              id="wh-url"
              type="url"
              placeholder="https://example.com/webhook"
              value={url}
              onChange={(e: { target: { value: SetStateAction<string> } }) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Events to subscribe</Label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map(event => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                >
                  <Badge
                    variant={events.includes(event) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                  >
                    {event}
                  </Badge>
                </button>
              ))}
            </div>
            {events.length === 0 && (
              <p className="text-xs text-muted-foreground">Select at least one event</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            disabled={!url || events.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Creating…' : 'Create webhook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
