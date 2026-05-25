import { cn } from '@/lib/utils'
import type { SystemStatus } from '@/lib/types'

interface StatusHubProps {
  status: SystemStatus
}

export function StatusHub({ status }: StatusHubProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-foreground">Status Hub</span>
      </div>

      <div className="space-y-3 p-4">
        {/* DGX Status Row */}
        <div className="grid grid-cols-2 gap-3">
          <StatusCard
            label="DGX"
            status={status.dgxMain}
            statusLabel={status.dgxMain}
          />
          <StatusCard
            label="Local"
            status={status.dgxLocal}
            statusLabel={status.dgxLocal}
          />
        </div>

        {/* Providers Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <span className="text-[10px] text-muted-foreground">Providers</span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-sm font-semibold text-status-online">
                {status.providers.active} active
              </span>
              <span className="text-[10px] text-muted-foreground">
                / {status.providers.active - status.providers.total} risky
              </span>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <span className="text-[10px] text-muted-foreground">Events</span>
            <div className="mt-0.5">
              <span className="text-sm font-medium text-foreground">
                2 buffered
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatusCardProps {
  label: string
  status: 'online' | 'offline'
  statusLabel: string
}

function StatusCard({ label, status, statusLabel }: StatusCardProps) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status === 'online' ? 'bg-status-online' : 'bg-status-offline'
          )}
        />
        <span
          className={cn(
            'text-sm font-medium',
            status === 'online' ? 'text-status-online' : 'text-status-offline'
          )}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  )
}
