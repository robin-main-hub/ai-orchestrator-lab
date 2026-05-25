'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentPane } from '@/components/tmux/agent-pane'
import type { TmuxPane } from '@/lib/types'

interface AgentPaneGridProps {
  panes: TmuxPane[]
}

export function AgentPaneGrid({ panes }: AgentPaneGridProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Grid Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-foreground">Agent Work Status</span>
        <span className="text-[10px] text-muted-foreground">
          {panes.length} panes / max 10
        </span>
      </div>

      {/* Scrollable Grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {panes.map(pane => (
            <AgentPane key={pane.id} pane={pane} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
