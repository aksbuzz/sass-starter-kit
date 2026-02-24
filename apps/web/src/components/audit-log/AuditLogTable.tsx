'use client'

import { useQuery } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Card, CardContent, Badge, Button, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@saas/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api/client'
import type { AuditLog } from '@/lib/api/types'

interface Props {
  page:        number
  onPageChange:(page: number) => void
}

const PAGE_SIZE = 20

interface AuditLogResponse {
  rows:   AuditLog[]
  total:  number
  limit:  number
  offset: number
}

const ACTION_VARIANT: Record<string, 'default' | 'destructive' | 'warning' | 'success' | 'secondary'> = {
  created: 'success',
  updated: 'default',
  deleted: 'destructive',
  invited: 'warning',
  joined:  'success',
  removed: 'destructive',
  revoked: 'destructive',
}

function actionVariant(action: string) {
  const verb = action.split('.').at(-1) ?? ''
  return ACTION_VARIANT[verb] ?? 'secondary'
}

export function AuditLogTable({ page, onPageChange }: Props) {
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditLog', page],
    queryFn:  () =>
      api.get<AuditLogResponse>(`${API_PATHS.auditLogs}?limit=${PAGE_SIZE}&offset=${offset}`),
  })

  const logs       = data?.rows                                    ?? []
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return <Card><CardContent className="p-6 text-sm text-destructive">Failed to load audit logs. Please refresh.</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No audit log entries</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={actionVariant(log.action)} className="font-mono text-xs">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">{log.resourceType}</span>
                      {log.resourceId && (
                        <span className="font-mono text-xs ml-1 text-muted-foreground/70">
                          {log.resourceId.slice(0, 8)}…
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.userId ? log.userId.slice(0, 8) + '…' : 'System'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button
              variant="outline" size="icon"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
