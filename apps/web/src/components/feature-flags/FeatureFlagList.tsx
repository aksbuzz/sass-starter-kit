'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Card, CardContent, Badge, Button, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@saas/ui'
import { Trash2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { FeatureFlagOverride } from '@/lib/api/types'

interface FlagsResponse {
  flags: FeatureFlagOverride[]
}

export function FeatureFlagList() {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['featureFlags'],
    queryFn:  () => api.get<FlagsResponse>(API_PATHS.featureFlags.list),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.put<{ flag: FeatureFlagOverride }>(API_PATHS.featureFlags.upsert(key), { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['featureFlags'] })
      toast({ title: 'Feature flag updated' })
    },
    onError: (err: unknown) =>
      toast({
        title:       'Error',
        description: err instanceof Error ? err.message : 'Failed to update flag',
        variant:     'destructive',
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.delete(API_PATHS.featureFlags.delete(key)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['featureFlags'] })
      toast({ title: 'Override removed' })
    },
    onError: (err: unknown) =>
      toast({
        title:       'Error',
        description: err instanceof Error ? err.message : 'Failed to remove override',
        variant:     'destructive',
      }),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return <Card><CardContent className="p-6 text-sm text-destructive">Failed to load feature flags. Please refresh.</CardContent></Card>
  }

  const flags = data?.flags ?? []

  return (
    <Card>
      <CardContent className="p-0">
        {flags.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No tenant overrides — all flags are using plan defaults.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Config</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {flags.map(flag => (
                <TableRow key={flag.id}>
                  <TableCell className="font-mono text-sm">{flag.key}</TableCell>
                  <TableCell>
                    <button
                      className="focus:outline-none"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ key: flag.key, enabled: !flag.enabled })}
                    >
                      <Badge
                        variant={flag.enabled ? 'success' : 'secondary'}
                        className="cursor-pointer select-none"
                      >
                        {flag.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                    {Object.keys(flag.config).length > 0
                      ? JSON.stringify(flag.config)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(flag.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
