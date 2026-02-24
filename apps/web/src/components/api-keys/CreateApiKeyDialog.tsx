'use client'

import { SetStateAction, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_PATHS } from '@saas/config'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, Input, Label,
} from '@saas/ui'
import { Copy, Check } from 'lucide-react'
import { api } from '@/lib/api/client'
import { useToast } from '@/lib/hooks/useToast'
import type { CreatedApiKey } from '@/lib/api/types'

interface Props {
  open:    boolean
  onClose: () => void
}

export function CreateApiKeyDialog({ open, onClose }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const [name, setName]     = useState('')
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [copied, setCopied]   = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.post<{ fullKey: string; apiKey: CreatedApiKey }>(
      API_PATHS.apiKeys.create, { name, scopes: ['read', 'write'] },
    ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['apiKeys'] })
      setCreated({ ...res.apiKey, fullKey: res.fullKey })
    },
    onError: (err: unknown) => {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create key', variant: 'destructive' })
    },
  })

  const handleCopy = async () => {
    if (!created) return
    await navigator.clipboard.writeText(created.fullKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setName('')
    setCreated(null)
    setCopied(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          {!created && <DialogDescription>Give your key a descriptive name</DialogDescription>}
        </DialogHeader>

        {!created ? (
          <>
            <div className="space-y-1.5 py-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="My CI/CD key"
                value={name}
                onChange={(e: { target: { value: SetStateAction<string> } }) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? 'Creating…' : 'Create key'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Copy your API key now — <span className="font-medium text-foreground">it won&apos;t be shown again.</span>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                {created.fullKey}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
