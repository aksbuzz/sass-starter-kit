'use client'

import { SetStateAction, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'

interface Props {
  open: boolean
  onClose: () => void
}

export function InviteMemberDialog({ open, onClose }: Props) {
  const qc         = useQueryClient()
  const { toast }  = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole]   = useState<'admin' | 'member'>('member')

  const mutation = useMutation({
    mutationFn: () => api.post(API_PATHS.tenants.inviteMember, { email, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      toast({ title: 'Invitation sent', description: `${email} has been invited as ${role}` })
      setEmail('')
      setRole('member')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to send invitation'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e: { target: { value: SetStateAction<string> } }) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={v => setRole(v as 'admin' | 'member')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!email || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
