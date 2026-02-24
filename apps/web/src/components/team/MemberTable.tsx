'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Badge, Button,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Avatar, AvatarFallback,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@saas/ui'
import { MoreHorizontal } from 'lucide-react'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { MemberWithUser } from '@/lib/api/types'

interface Props {
  members:       MemberWithUser[]
  currentRole:   string
  currentUserId: string | null
}

const ROLE_BADGE: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default', admin: 'secondary', member: 'outline',
}

export function MemberTable({ members, currentRole, currentUserId }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const removeMutation = useMutation({
    mutationFn: (membershipId: string) => api.delete(API_PATHS.tenants.removeMember(membershipId)),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['members'] }); toast({ title: 'Member removed' }) },
    onError:    (err: unknown) => toast({ title: 'Error', description: (err instanceof Error ? err.message : 'Failed to remove'), variant: 'destructive' }),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(API_PATHS.tenants.memberRole(id), { role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); toast({ title: 'Role updated' }) },
    onError:   (err: unknown) => toast({ title: 'Error', description: (err instanceof Error ? err.message : 'Failed to update role'), variant: 'destructive' }),
  })

  const canManage = currentRole === 'owner' || currentRole === 'admin'

  return (
    <>
    <Dialog open={confirmRemoveId !== null} onOpenChange={open => { if (!open) setConfirmRemoveId(null) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove member</DialogTitle>
          <DialogDescription>This will immediately revoke their access. This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmRemoveId(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={removeMutation.isPending}
            onClick={() => { if (confirmRemoveId) { removeMutation.mutate(confirmRemoveId); setConfirmRemoveId(null) } }}
          >
            {removeMutation.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          {canManage && <TableHead className="w-10" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map(m => (
          <TableRow key={m.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {(m.user.name ?? m.user.email).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{m.user.name ?? m.user.email}</p>
                  {m.user.name && <p className="text-xs text-muted-foreground">{m.user.email}</p>}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={ROLE_BADGE[m.role] ?? 'outline'} className="capitalize">{m.role}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(m.joinedAt).toLocaleDateString()}
            </TableCell>
            {canManage && (
              <TableCell>
                {m.userId !== currentUserId && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {currentRole === 'owner' && m.role !== 'admin' && (
                        <DropdownMenuItem onClick={() => roleMutation.mutate({ id: m.id, role: 'admin' })}>
                          Make admin
                        </DropdownMenuItem>
                      )}
                      {currentRole === 'owner' && m.role !== 'member' && (
                        <DropdownMenuItem onClick={() => roleMutation.mutate({ id: m.id, role: 'member' })}>
                          Make member
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setConfirmRemoveId(m.id)}
                      >
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </>
  )
}
