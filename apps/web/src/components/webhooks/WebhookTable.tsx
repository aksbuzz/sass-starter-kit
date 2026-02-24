'use client'

import { Fragment, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Card, CardContent, Badge, Button,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@saas/ui'
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { DeliveryHistory } from './DeliveryHistory'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { WebhookEndpoint } from '@/lib/api/types'

interface Props {
  endpoints: WebhookEndpoint[]
}

export function WebhookTable({ endpoints }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(API_PATHS.webhooks.delete(id)),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      toast({ title: 'Webhook deleted' })
    },
    onError: (err: unknown) =>
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete webhook',
        variant: 'destructive',
      }),
  })

  const toggleExpand = (id: string) =>
    setExpanded(prev => prev === id ? null : id)

  return (
    <>
    <Dialog open={confirmDeleteId !== null} onOpenChange={open => { if (!open) setConfirmDeleteId(null) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete webhook</DialogTitle>
          <DialogDescription>This will permanently delete the endpoint and stop sending events to it.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => { if (confirmDeleteId) { deleteMutation.mutate(confirmDeleteId); setConfirmDeleteId(null) } }}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.map(ep => (
              <Fragment key={ep.id}>
                <TableRow className="cursor-pointer" onClick={() => toggleExpand(ep.id)}>
                  <TableCell>
                    {expanded === ep.id
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-xs truncate">{ep.url}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ep.events.slice(0, 3).map(e => (
                        <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                      ))}
                      {ep.events.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{ep.events.length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ep.isActive ? 'success' : 'secondary'}>
                      {ep.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e: { stopPropagation: () => any }) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => setConfirmDeleteId(ep.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>

                {expanded === ep.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30 p-0">
                      <DeliveryHistory endpointId={ep.id} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </>
  )
}
