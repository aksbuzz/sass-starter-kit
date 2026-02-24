import { SetStateAction, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query'
import { ROUTES, API_PATHS, SESSION_COOKIE_NAME } from '@saas/config'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  Button, Input, Label, Badge,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/lib/store/auth.slice'
import type { WorkspaceListItem } from '@/lib/api/types'
import { useToast } from '@/lib/hooks/useToast'

export function WorkspacePickerPage() {
  const navigate = useNavigate();
  const { toast }    = useToast()
  const [creating, setCreating] = useState(false)
  const [name, setName]         = useState('')
  const [slug, setSlug]         = useState('')
  const authStatus   = useAuthStore(s => s.status)

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      navigate({ to: ROUTES.login, replace: true });
    }
  }, [authStatus, navigate])

  const { data, isLoading } = useQuery({
    queryKey:  ['workspaces'],
    queryFn:   () => api.get<{ workspaces: WorkspaceListItem[] }>(API_PATHS.tenants.list),
    enabled:   authStatus === 'authenticated',
    retry:     1,
  })

  const selectMutation = useMutation({
    mutationFn: (tenantId: string) =>
      api.post<{ accessToken: string }>(API_PATHS.auth.workspace, { tenantId }),
    onSuccess: (res) => {
      useAuthStore.getState().setToken(res.accessToken)
      // Refresh indicator cookie (extends session)
      document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`
      navigate({ to: ROUTES.dashboard, replace: true });
    },
    onError: () => toast({ title: 'Error', description: 'Could not select workspace', variant: 'destructive' }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<{ tenant: { id: string } }>(API_PATHS.tenants.create, { name, slug: slug || undefined }),
    onSuccess: (res) => selectMutation.mutate(res.tenant.id),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not create workspace'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  const workspaces   = data?.workspaces ?? []
  const autoSelected = useRef(false)

  // Auto-select if there's exactly one workspace — must be in useEffect to avoid
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

            {!creating ? (
              <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
                + Create a new workspace
              </Button>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">New workspace</CardTitle>
                  <CardDescription>Give your workspace a name and optional slug</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="ws-name">Name</Label>
                    <Input
                      id="ws-name"
                      placeholder="Acme Corp"
                      value={name}
                      onChange={(e: { target: { value: SetStateAction<string> } }) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ws-slug">Slug (optional)</Label>
                    <Input
                      id="ws-slug"
                      placeholder="acme-corp"
                      value={slug}
                      onChange={(e: { target: { value: SetStateAction<string> } }) => setSlug(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={!name || createMutation.isPending}
                      onClick={() => createMutation.mutate()}
                    >
                      {createMutation.isPending ? 'Creating…' : 'Create'}
                    </Button>
                    <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
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
