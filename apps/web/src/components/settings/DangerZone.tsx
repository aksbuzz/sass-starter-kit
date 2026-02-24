import { SetStateAction, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { API_PATHS, ROUTES, SESSION_COOKIE_NAME } from '@saas/config'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription, Input, Label,
} from '@saas/ui'
import { useAuthStore } from '@/lib/store/auth.slice'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'

interface Props {
  workspaceName: string
}

export function DangerZone({ workspaceName }: Props) {
  const navigate  = useNavigate()
  const clearToken = useAuthStore(s => s.clearToken)
  const { toast } = useToast()
  const [open, setOpen]       = useState(false)
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.delete(API_PATHS.tenants.me),
    onSuccess: () => {
      document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0`
      clearToken()
      navigate({ to: ROUTES.login, replace: true })
    },
    onError: (err: unknown) =>
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete workspace',
        variant: 'destructive',
      }),
  })

  return (
    <>
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Permanently delete this workspace and all its data</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete workspace
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { if (!v) { setOpen(false); setConfirm('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              This action is <span className="font-semibold text-foreground">permanent and irreversible</span>.
              All members, API keys, and data will be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="confirm-name">
              Type <span className="font-mono font-medium">{workspaceName}</span> to confirm
            </Label>
            <Input
              id="confirm-name"
              value={confirm}
              onChange={(e: { target: { value: SetStateAction<string> } }) => setConfirm(e.target.value)}
              placeholder={workspaceName}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setConfirm('') }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== workspaceName || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Deleting…' : 'Delete workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
