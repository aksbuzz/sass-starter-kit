import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { AuditLogTable } from '@/components/audit-log/AuditLogTable'

export function AuditLogPage() {
  const [page, setPage] = useState(1)

  return (
    <div className="flex flex-col h-full">
      <Header title="Audit Log" />
      <div className="flex-1 p-6">
        <AuditLogTable page={page} onPageChange={setPage} />
      </div>
    </div>
  )
}
