import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Button, Card, CardContent, Badge, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@saas/ui'
import { Plus, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { CreateApiKeyDialog } from '@/components/api-keys/CreateApiKeyDialog'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { ApiKey } from '@/lib/api/types'

export function ApiKeysPage() {
  const [showCreate, setShowCreate]     = useState(false)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const qc        = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['apiKeys'],
    queryFn:  () => api.get<{ apiKeys: ApiKey[] }>(API_PATHS.apiKeys.list),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(API_PATHS.apiKeys.revoke(id)),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['apiKeys'] }); toast({ title: 'API key revoked' }) },
    onError:    (err: unknown) => toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to revoke', variant: 'destructive' }),
  })

  const apiKeys = data?.apiKeys ?? []

  return (
    <div className="flex flex-col h-full">
      <Header title="API Keys" />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{apiKeys.length} key{apiKeys.length !== 1 ? 's' : ''}</p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create key
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : apiKeys.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No API keys yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map(k => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{k.prefix}…</code></TableCell>
                      <TableCell>
                        <Badge variant={k.revokedAt ? 'destructive' : 'success'}>
                          {k.revokedAt ? 'Revoked' : 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        {!k.revokedAt && (
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmRevokeId(k.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateApiKeyDialog open={showCreate} onClose={() => setShowCreate(false)} />

      <Dialog open={confirmRevokeId !== null} onOpenChange={open => { if (!open) setConfirmRevokeId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>This will immediately invalidate the key. Any integrations using it will stop working.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevokeId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => { if (confirmRevokeId) { revokeMutation.mutate(confirmRevokeId); setConfirmRevokeId(null) } }}
            >
              {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
