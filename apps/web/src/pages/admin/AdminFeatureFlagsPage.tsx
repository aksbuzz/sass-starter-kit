import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Badge, Button, Card, CardContent,
  Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import { Header } from '@/components/layout/Header'

interface PlatformFlag {
  key:       string
  enabled:   boolean
  config:    Record<string, unknown>
  scopeType: string
  updatedAt: string
}

interface ListFlagsResponse {
  flags: PlatformFlag[]
}

export function AdminFeatureFlagsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'feature-flags'],
    queryFn:  () => api.get<ListFlagsResponse>(API_PATHS.admin.featureFlags.list),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled, config }: { key: string; enabled: boolean; config: Record<string, unknown> }) =>
      api.put(API_PATHS.admin.featureFlags.upsert(key), { enabled, config }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feature-flags'] })
      toast({ title: 'Flag updated' })
    },
    onError: () => toast({ title: 'Error', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.delete(API_PATHS.admin.featureFlags.delete(key)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feature-flags'] })
      toast({ title: 'Flag deleted' })
    },
    onError: () => toast({ title: 'Error', variant: 'destructive' }),
  })

  const flags = data?.flags ?? []

  return (
    <div className="flex flex-col h-full">
      <Header title="Platform Feature Flags" />

      <div className="flex-1 p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Global defaults applied to all tenants. Tenant-level overrides take precedence.
        </p>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : flags.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                No platform-level flags configured.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Config</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flags.map(flag => (
                    <TableRow key={flag.key}>
                      <TableCell className="font-mono text-sm">{flag.key}</TableCell>
                      <TableCell>
                        <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                          {flag.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {Object.keys(flag.config).length > 0
                          ? JSON.stringify(flag.config)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={toggleMutation.isPending}
                            onClick={() => toggleMutation.mutate({
                              key:     flag.key,
                              enabled: !flag.enabled,
                              config:  flag.config,
                            })}
                          >
                            {flag.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete flag "${flag.key}"?`)) deleteMutation.mutate(flag.key)
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
