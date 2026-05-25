'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { SystemStatus } from '@/lib/types'

interface StatusIndicatorProps {
  status: SystemStatus
  className?: string
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const healthColor = {
    healthy: 'bg-status-online',
    degraded: 'bg-status-pending',
    error: 'bg-status-offline',
  }[status.health]

  const healthLabel = {
    healthy: 'All systems operational',
    degraded: 'Some systems degraded',
    error: 'System error',
  }[status.health]

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-muted/50',
            className
          )}
          aria-label={`System status: ${healthLabel}`}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              healthColor,
              status.health !== 'healthy' && 'status-pulse'
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 border-border bg-card p-0"
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', healthColor)} />
            <span className="text-sm font-medium text-foreground">
              {healthLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Last checked: {status.lastChecked.toLocaleTimeString()}
          </p>
        </div>

        <div className="space-y-1 p-2">
          <StatusRow
            label="DGX Main"
            status={status.dgxMain}
          />
          <StatusRow
            label="DGX Local"
            status={status.dgxLocal}
          />
          <StatusRow
            label="Event Storage"
            status={status.eventStorage === 'available' ? 'online' : 'offline'}
          />
          <div className="flex items-center justify-between rounded-md px-2 py-1.5">
            <span className="text-xs text-muted-foreground">Providers</span>
            <span className="text-xs font-medium text-foreground">
              {status.providers.active} / {status.providers.total} active
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface StatusRowProps {
  label: string
  status: 'online' | 'offline'
}

function StatusRow({ label, status }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/30">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status === 'online' ? 'bg-status-online' : 'bg-status-offline'
          )}
        />
        <span
          className={cn(
            'text-xs font-medium',
            status === 'online' ? 'text-status-online' : 'text-status-offline'
          )}
        >
          {status}
        </span>
      </div>
    </div>
  )
}
