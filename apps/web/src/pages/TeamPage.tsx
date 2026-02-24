import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import { Button, Card, CardContent, Skeleton } from '@saas/ui'
import { UserPlus } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { MemberTable } from '@/components/team/MemberTable'
import { InviteMemberDialog } from '@/components/team/InviteMemberDialog'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/lib/store/auth.slice'
import type { MemberWithUser } from '@/lib/api/types'

export function TeamPage() {
  const [showInvite, setShowInvite] = useState(false)
  const auth = useAuthStore()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['members'],
    queryFn:  () => api.get<{ members: MemberWithUser[] }>(API_PATHS.tenants.members),
  })

  const canInvite = auth.role === 'owner' || auth.role === 'admin'

  return (
    <div className="flex flex-col h-full">
      <Header title="Team" />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data?.members.length ?? 0} member{data?.members.length !== 1 ? 's' : ''}
          </p>
          {canInvite && (
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite member
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="p-6 text-sm text-destructive">Failed to load team members. Please refresh.</div>
            ) : (
              <MemberTable
                members={data?.members ?? []}
                currentRole={auth.role ?? 'member'}
                currentUserId={auth.userId}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <InviteMemberDialog open={showInvite} onClose={() => setShowInvite(false)} />
    </div>
  )
}
