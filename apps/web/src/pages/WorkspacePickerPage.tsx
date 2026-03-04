import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query'
import { ROUTES, API_PATHS, SESSION_COOKIE_NAME } from '@saas/config'
import { Card, CardContent, Badge, Button, Input, Label } from '@saas/ui'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useAuthStore } from '@/lib/store/auth.slice'
import type { WorkspaceListItem } from '@/lib/api/types'
import { useToast } from '@/lib/hooks/useToast'

export function WorkspacePickerPage() {
  const navigate = useNavigate();
  const { toast }    = useToast()
  const { status: authStatus, isPlatformAdmin } = useAuth()

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName]               = useState('')
  const [newSlug, setNewSlug]               = useState('')

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      navigate({ to: ROUTES.login, replace: true });
    }
  }, [authStatus, navigate])

  const { data, isLoading } = useQuery({
    queryKey:  ['workspaces'],
    queryFn:   () => api.get<{ workspaces: WorkspaceListItem[] }>(API_PATHS.tenants.list),
    enabled:   authStatus === 'authenticated' && !isPlatformAdmin,
    retry:     1,
  })

  const selectMutation = useMutation({
    mutationFn: (tenantId: string) =>
      api.post<{ accessToken: string }>(API_PATHS.auth.workspace, { tenantId }),
    onSuccess: (res) => {
      useAuthStore.getState().setToken(res.accessToken)
      document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`
      navigate({ to: ROUTES.dashboard, replace: true });
    },
    onError: () => toast({ title: 'Error', description: 'Could not select workspace', variant: 'destructive' }),
  })

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const created  = await api.post<{ tenant: { id: string } }>(API_PATHS.admin.tenants.create, data)
      const selected = await api.post<{ accessToken: string }>(API_PATHS.auth.workspace, { tenantId: created.tenant.id })
      return selected.accessToken
    },
    onSuccess: (accessToken) => {
      useAuthStore.getState().setToken(accessToken)
      document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`
      navigate({ to: ROUTES.dashboard, replace: true });
    },
    onError: () => toast({ title: 'Error', description: 'Could not create workspace', variant: 'destructive' }),
  })

  const workspaces   = data?.workspaces ?? []
  const autoSelected = useRef(false)

  useEffect(() => {
    if (!isLoading && workspaces.length === 1 && !autoSelected.current) {
      autoSelected.current = true
      selectMutation.mutate(workspaces[0]!.tenantId)
    }
  }, [isLoading, workspaces])

  const roleBadge = (role: string) => {
    if (role === 'owner') return <Badge variant="default">Owner</Badge>
    if (role === 'admin') return <Badge variant="secondary">Admin</Badge>
    return <Badge variant="outline">Member</Badge>
  }

  const handleCreate = () => {
    createMutation.mutate({ name: newName, ...(newSlug ? { slug: newSlug } : {}) })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Choose a workspace</h1>
          <p className="text-muted-foreground text-sm mt-1">Select a workspace to continue</p>
        </div>

        {isLoading || selectMutation.isPending ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {workspaces.length > 0 && (
              <div className="space-y-2">
                {workspaces.map(ws => (
                  <Card
                    key={ws.tenantId}
                    className="cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => selectMutation.mutate(ws.tenantId)}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{ws.tenantName}</p>
                        <p className="text-xs text-muted-foreground">{ws.tenantSlug}</p>
                      </div>
                      {roleBadge(ws.role)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {workspaces.length === 0 && !isPlatformAdmin && (
              <p className="text-center text-sm text-muted-foreground py-4">
                You haven't been added to any workspace yet. Contact your administrator.
              </p>
            )}

            {isPlatformAdmin && !showCreateForm && (
              <Button
                className="w-full"
                onClick={() => setShowCreateForm(true)}
              >
                Create a new workspace
              </Button>
            )}

            {isPlatformAdmin && showCreateForm && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <h2 className="font-semibold text-lg">New workspace</h2>
                  <div className="space-y-2">
                    <Label htmlFor="ws-name">Name</Label>
                    <Input
                      id="ws-name"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-slug">Slug (optional)</Label>
                    <Input
                      id="ws-slug"
                      value={newSlug}
                      onChange={e => setNewSlug(e.target.value)}
                      placeholder="acme-corp"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreate}
                      disabled={!newName.trim() || createMutation.isPending}
                    >
                      Create
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setShowCreateForm(false); setNewName(''); setNewSlug('') }}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
