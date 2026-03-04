import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Button, Input, Label, Badge,
  Card, CardContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Skeleton,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import { Header } from '@/components/layout/Header'

interface AdminTenant {
  tenant: {
    id: string; name: string; slug: string
    status: 'trialing' | 'active' | 'suspended' | 'deleted'
    createdAt: string
  }
  memberCount: number
  planSlug: string | null
}

interface ListTenantsResponse {
  tenants: AdminTenant[]
  total:   number
  limit:   number
  offset:  number
}

const STATUS_COLORS: Record<string, string> = {
  trialing:  'secondary',
  active:    'default',
  suspended: 'destructive',
  deleted:   'outline',
}

export function AdminTenantsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', ownerEmail: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tenants', search, statusFilter],
    queryFn:  () => api.get<ListTenantsResponse>(
      `${API_PATHS.admin.tenants.list}?search=${encodeURIComponent(search)}&${statusFilter !== 'all' ? `status=${statusFilter}` : ''}`,
    ),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post(API_PATHS.admin.tenants.create, {
      name:       form.name,
      slug:       form.slug || undefined,
      ownerEmail: form.ownerEmail || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      setShowCreate(false)
      setForm({ name: '', slug: '', ownerEmail: '' })
      toast({ title: 'Tenant created' })
    },
    onError: (err: unknown) => toast({
      title: 'Error',
      description: err instanceof Error ? err.message : 'Could not create tenant',
      variant: 'destructive',
    }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(API_PATHS.admin.tenants.update(id), { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      toast({ title: 'Tenant updated' })
    },
    onError: () => toast({ title: 'Error', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(API_PATHS.admin.tenants.delete(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      toast({ title: 'Tenant deleted' })
    },
    onError: () => toast({ title: 'Error', variant: 'destructive' }),
  })

  const tenants = data?.tenants ?? []

  return (
    <div className="flex flex-col h-full">
      <Header title="Tenants" />

      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Input
              placeholder="Search by name or slug…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8"
            />
            <Select value={statusFilter} onValueChange={setStatus}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>New Tenant</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : tenants.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No tenants found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map(({ tenant, memberCount, planSlug }) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{tenant.slug}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[tenant.status] as 'default' | 'secondary' | 'destructive' | 'outline' ?? 'outline'}>
                          {tenant.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{planSlug ?? '—'}</TableCell>
                      <TableCell className="text-right">{memberCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {tenant.status !== 'suspended' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => updateMutation.mutate({ id: tenant.id, status: 'suspended' })}
                            >
                              Suspend
                            </Button>
                          )}
                          {tenant.status === 'suspended' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => updateMutation.mutate({ id: tenant.id, status: 'active' })}
                            >
                              Activate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete "${tenant.name}"?`)) deleteMutation.mutate(tenant.id)
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

        {data && (
          <p className="text-xs text-muted-foreground">
            Showing {tenants.length} of {data.total} tenants
          </p>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="t-name">Name *</Label>
              <Input id="t-name" placeholder="Acme Corp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-slug">Slug (optional)</Label>
              <Input id="t-slug" placeholder="acme-corp" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-email">Owner email (optional)</Label>
              <Input id="t-email" type="email" placeholder="owner@acme.com" value={form.ownerEmail} onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))} />
              <p className="text-xs text-muted-foreground">An invitation will be sent if provided.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!form.name || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
