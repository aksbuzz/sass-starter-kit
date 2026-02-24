'use client'

import { SetStateAction, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
  Button, Input, Label,
} from '@saas/ui'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { Tenant } from '@/lib/api/types'

interface Props {
  tenant: Tenant
}

export function GeneralSettings({ tenant }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(tenant.name)
  const [slug, setSlug] = useState(tenant.slug)

  useEffect(() => {
    setName(tenant.name)
    setSlug(tenant.slug)
  }, [tenant.name, tenant.slug])

  const mutation = useMutation({
    mutationFn: () => api.patch<{ tenant: Tenant }>(API_PATHS.tenants.me, { name, slug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace'] })
      toast({ title: 'Settings saved' })
    },
    onError: (err: unknown) =>
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save settings',
        variant: 'destructive',
      }),
  })

  const isDirty = name !== tenant.name || slug !== tenant.slug

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Update your workspace name and URL slug</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(e: { target: { value: SetStateAction<string> } }) => setName(e.target.value)}
            placeholder="Acme Inc."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-slug">URL slug</Label>
          <Input
            id="ws-slug"
            value={slug}
            onChange={(e: { target: { value: string } }) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="acme"
          />
          <p className="text-xs text-muted-foreground">Only lowercase letters, numbers, and hyphens</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          disabled={!isDirty || !name || !slug || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </CardFooter>
    </Card>
  )
}
