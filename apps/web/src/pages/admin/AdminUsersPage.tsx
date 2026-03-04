import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { API_PATHS, ROUTES, SESSION_COOKIE_NAME } from '@saas/config'
import {
  Badge, Button, Card, CardContent, Input,
  Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/lib/store/auth.slice'
import { useToast } from '@/lib/hooks/useToast'
import { Header } from '@/components/layout/Header'

interface AdminUser {
  user: {
    id:              string
    email:           string
    name:            string | null
    isPlatformAdmin: boolean
    createdAt:       string
  }
  workspaceCount: number
}

interface ListUsersResponse {
  users:  AdminUser[]
  total:  number
  limit:  number
  offset: number
}

export function AdminUsersPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn:  () => api.get<ListUsersResponse>(
      `${API_PATHS.admin.users.list}?search=${encodeURIComponent(search)}`,
    ),
  })

  const impersonateMutation = useMutation({
    mutationFn: ({ targetUserId, tenantId }: { targetUserId: string; tenantId: string }) =>
      api.post<{ accessToken: string }>(API_PATHS.auth.impersonate, { targetUserId, tenantId }),
    onSuccess: (res) => {
      useAuthStore.getState().setToken(res.accessToken)
      document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=${2 * 60 * 60}; samesite=lax`
      qc.clear()
      navigate({ to: ROUTES.dashboard })
    },
    onError: (err: unknown) => toast({
      title: 'Cannot impersonate',
      description: err instanceof Error ? err.message : 'Error',
      variant: 'destructive',
    }),
  })

  const users = data?.users ?? []

  return (
    <div className="flex flex-col h-full">
      <Header title="Users" />

      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center gap-2 max-w-sm">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : users.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No users found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Workspaces</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(({ user, workspaceCount }) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell className="text-muted-foreground">{user.name ?? '—'}</TableCell>
                      <TableCell>
                        {user.isPlatformAdmin
                          ? <Badge variant="default">Platform Admin</Badge>
                          : <Badge variant="outline">User</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-right">{workspaceCount}</TableCell>
                      <TableCell className="text-right">
                        {!user.isPlatformAdmin && workspaceCount > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={impersonateMutation.isPending}
                            onClick={() => {
                              const tenantId = prompt('Enter tenant ID to impersonate within:')
                              if (tenantId) impersonateMutation.mutate({ targetUserId: user.id, tenantId })
                            }}
                          >
                            Impersonate
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

        {data && (
          <p className="text-xs text-muted-foreground">
            Showing {users.length} of {data.total} users
          </p>
        )}
      </div>
    </div>
  )
}
