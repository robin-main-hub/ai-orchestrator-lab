'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { AgentsPanel } from '@/components/sidebar/agents-panel'
import { MementoPanel } from '@/components/sidebar/memento-panel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { sampleMementoContext } from '@/lib/mock-data'
import type { Agent } from '@/lib/types'

interface SidebarProps {
  agents: Agent[]
  currentAgentId: string
  onSelectAgent: (agent: Agent) => void
  className?: string
}

export function Sidebar({
  agents,
  currentAgentId,
  onSelectAgent,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col border-l border-border bg-sidebar',
        className
      )}
    >
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {/* Agents Panel */}
          <AgentsPanel
            agents={agents}
            currentAgentId={currentAgentId}
            onSelectAgent={onSelectAgent}
          />

          {/* Memento Panel */}
          <MementoPanel context={sampleMementoContext} />
        </div>
      </ScrollArea>
    </aside>
  )
}
