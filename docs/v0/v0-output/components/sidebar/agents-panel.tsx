'use client'

import * as React from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { AgentCard } from '@/components/sidebar/agent-card'
import type { Agent } from '@/lib/types'

interface AgentsPanelProps {
  agents: Agent[]
  currentAgentId: string
  onSelectAgent: (agent: Agent) => void
}

export function AgentsPanel({
  agents,
  currentAgentId,
  onSelectAgent,
}: AgentsPanelProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  // Group agents by category
  const coreAgents = agents.filter(a => a.category === 'core')
  const specialistAgents = agents.filter(a => a.category === 'specialist')
  const companionAgents = agents.filter(a => a.category === 'companion')

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary">
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  !isOpen && '-rotate-90'
                )}
              />
              Agents
            </button>
          </CollapsibleTrigger>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="space-y-3 p-2">
            {/* Core Agents */}
            <AgentGroup
              label="Core"
              agents={coreAgents}
              currentAgentId={currentAgentId}
              onSelectAgent={onSelectAgent}
            />

            {/* Specialist Agents */}
            <AgentGroup
              label="Specialists"
              agents={specialistAgents}
              currentAgentId={currentAgentId}
              onSelectAgent={onSelectAgent}
            />

            {/* Companion Agents (collapsed by default) */}
            <AgentGroupCollapsible
              label="Companions"
              agents={companionAgents}
              currentAgentId={currentAgentId}
              onSelectAgent={onSelectAgent}
              defaultOpen={false}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

interface AgentGroupProps {
  label: string
  agents: Agent[]
  currentAgentId: string
  onSelectAgent: (agent: Agent) => void
}

function AgentGroup({
  label,
  agents,
  currentAgentId,
  onSelectAgent,
}: AgentGroupProps) {
  return (
    <div className="space-y-1">
      <span className="px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="space-y-1">
        {agents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isSelected={agent.id === currentAgentId}
            onSelect={() => onSelectAgent(agent)}
          />
        ))}
      </div>
    </div>
  )
}

interface AgentGroupCollapsibleProps extends AgentGroupProps {
  defaultOpen?: boolean
}

function AgentGroupCollapsible({
  label,
  agents,
  currentAgentId,
  onSelectAgent,
  defaultOpen = true,
}: AgentGroupCollapsibleProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-transform',
              !isOpen && '-rotate-90'
            )}
          />
          {label} ({agents.length})
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={agent.id === currentAgentId}
              onSelect={() => onSelectAgent(agent)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
