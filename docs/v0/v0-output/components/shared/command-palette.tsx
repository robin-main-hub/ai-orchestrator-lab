'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search, MessageSquare, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AvatarWithStatus } from '@/components/shared/avatar-with-status'
import { agents, getAgentsByCategory } from '@/lib/mock-data'
import type { Agent } from '@/lib/types'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectAgent: (agent: Agent) => void
}

export function CommandPalette({
  open,
  onOpenChange,
  onSelectAgent,
}: CommandPaletteProps) {
  const [search, setSearch] = React.useState('')

  const coreAgents = getAgentsByCategory('core')
  const specialistAgents = getAgentsByCategory('specialist')
  const companionAgents = getAgentsByCategory('companion')

  const handleSelect = (agent: Agent) => {
    onSelectAgent(agent)
    onOpenChange(false)
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-border bg-card p-0 shadow-2xl sm:max-w-lg">
        <CommandPrimitive
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
          filter={(value, search) => {
            const agent = agents.find(a => a.id === value)
            if (!agent) return 0
            const searchLower = search.toLowerCase()
            if (agent.name.toLowerCase().includes(searchLower)) return 1
            if (agent.nameEn.toLowerCase().includes(searchLower)) return 1
            if (agent.role.toLowerCase().includes(searchLower)) return 0.5
            if (agent.roleKo.includes(searchLower)) return 0.5
            return 0
          }}
        >
          {/* Search Input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search agents... (e.g., @채아린, Architect)"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <kbd className="hidden rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          <CommandPrimitive.List className="max-h-80 overflow-y-auto p-2">
            <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
              No agents found.
            </CommandPrimitive.Empty>

            {/* Quick Actions */}
            <CommandPrimitive.Group heading="Quick Actions" className="mb-2">
              <QuickActionItem
                icon={<MessageSquare className="h-4 w-4" />}
                label="New conversation"
                shortcut="N"
              />
              <QuickActionItem
                icon={<Zap className="h-4 w-4" />}
                label="Switch to Debate"
                shortcut="D"
              />
              <QuickActionItem
                icon={<Users className="h-4 w-4" />}
                label="Open Tmux Swarm"
                shortcut="T"
              />
            </CommandPrimitive.Group>

            {/* Core Agents */}
            <CommandPrimitive.Group heading="Core Agents" className="mb-2">
              {coreAgents.map(agent => (
                <AgentCommandItem
                  key={agent.id}
                  agent={agent}
                  onSelect={() => handleSelect(agent)}
                />
              ))}
            </CommandPrimitive.Group>

            {/* Specialist Agents */}
            <CommandPrimitive.Group heading="Specialists" className="mb-2">
              {specialistAgents.map(agent => (
                <AgentCommandItem
                  key={agent.id}
                  agent={agent}
                  onSelect={() => handleSelect(agent)}
                />
              ))}
            </CommandPrimitive.Group>

            {/* Companion Agents */}
            <CommandPrimitive.Group heading="Companions">
              {companionAgents.map(agent => (
                <AgentCommandItem
                  key={agent.id}
                  agent={agent}
                  onSelect={() => handleSelect(agent)}
                />
              ))}
            </CommandPrimitive.Group>
          </CommandPrimitive.List>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <span className="text-[10px] text-muted-foreground">
              {agents.length} agents available
            </span>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 font-mono">↵</kbd>
                select
              </span>
            </div>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  )
}

interface AgentCommandItemProps {
  agent: Agent
  onSelect: () => void
}

function AgentCommandItem({ agent, onSelect }: AgentCommandItemProps) {
  return (
    <CommandPrimitive.Item
      value={agent.id}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm',
        'aria-selected:bg-muted/50',
        agent.isPrimary && 'bg-primary/5'
      )}
    >
      <AvatarWithStatus
        initials={agent.avatar}
        roleColor={agent.avatarColor}
        status={agent.status}
        isPrimary={agent.isPrimary}
        size="sm"
      />
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{agent.name}</span>
          {agent.isPrimary && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Primary
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {agent.roleKo} · {agent.model}
        </span>
      </div>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          agent.status === 'online' || agent.status === 'active'
            ? 'bg-status-online'
            : agent.status === 'idle' || agent.status === 'ready'
            ? 'bg-status-idle'
            : 'bg-status-offline'
        )}
      />
    </CommandPrimitive.Item>
  )
}

interface QuickActionItemProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
}

function QuickActionItem({ icon, label, shortcut }: QuickActionItemProps) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm',
        'aria-selected:bg-muted/50'
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
        {icon}
      </div>
      <span className="flex-1 text-foreground">{label}</span>
      {shortcut && (
        <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </CommandPrimitive.Item>
  )
}

// Hook to manage command palette keyboard shortcut
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return { open, setOpen }
}
