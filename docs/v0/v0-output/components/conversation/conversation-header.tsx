'use client'

import * as React from 'react'
import { ChevronDown, Settings, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AvatarWithStatus } from '@/components/shared/avatar-with-status'
import { StatusBadge } from '@/components/shared/status-badge'
import { agents, getAgentsByCategory } from '@/lib/mock-data'
import type { Agent } from '@/lib/types'

interface ConversationHeaderProps {
  agent: Agent
  onSwitchAgent: () => void
  sessionId: string
}

export function ConversationHeader({
  agent,
  onSwitchAgent,
  sessionId,
}: ConversationHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/30 px-4">
      {/* Left: Agent Info with Dropdown */}
      <AgentSelector agent={agent} onSwitchAgent={onSwitchAgent} />

      {/* Center: Session Info */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground">현재 대화 상대</span>
          <span className="text-xs font-medium text-foreground">
            {agent.name} / {sessionId.slice(-8)}
          </span>
        </div>
      </div>

      {/* Right: Session Settings */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-end text-[10px]">
          <span className="text-muted-foreground">Profile</span>
          <span className="text-foreground">{agent.isPrimary ? '지휘자' : agent.roleKo}</span>
        </div>
        <div className="flex flex-col items-end text-[10px]">
          <span className="text-muted-foreground">Memory</span>
          <span className="text-foreground">auto</span>
        </div>
        <div className="flex flex-col items-end text-[10px]">
          <span className="text-muted-foreground">Preview</span>
          <span className="text-foreground">internal</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}

interface AgentSelectorProps {
  agent: Agent
  onSwitchAgent: () => void
}

function AgentSelector({ agent, onSwitchAgent }: AgentSelectorProps) {
  const coreAgents = getAgentsByCategory('core')
  const companionAgents = getAgentsByCategory('companion')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/30">
          <AvatarWithStatus
            initials={agent.avatar}
            roleColor={agent.avatarColor}
            status={agent.status}
            isPrimary={agent.isPrimary}
            size="lg"
          />
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {agent.name}
              </span>
              {agent.isPrimary && (
                <StatusBadge variant="primary" size="sm">Primary</StatusBadge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {agent.roleKo} · {agent.model}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        {/* Command Palette Shortcut */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Quick switch</span>
          <button
            onClick={onSwitchAgent}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Cpu className="h-3 w-3" />
            <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>
        </div>

        <DropdownMenuSeparator />

        {/* Core Agents */}
        <div className="px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Core Agents
          </span>
        </div>
        {coreAgents.map(a => (
          <AgentMenuItem
            key={a.id}
            agent={a}
            isSelected={a.id === agent.id}
          />
        ))}

        <DropdownMenuSeparator />

        {/* Companion Agents */}
        <div className="px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Companions
          </span>
        </div>
        {companionAgents.slice(0, 5).map(a => (
          <AgentMenuItem
            key={a.id}
            agent={a}
            isSelected={a.id === agent.id}
          />
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onSwitchAgent}
          className="justify-center text-xs text-primary"
        >
          View all {agents.length} agents
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface AgentMenuItemProps {
  agent: Agent
  isSelected: boolean
}

function AgentMenuItem({ agent, isSelected }: AgentMenuItemProps) {
  return (
    <DropdownMenuItem
      className={cn(
        'flex items-center gap-2 py-2',
        isSelected && 'bg-primary/10'
      )}
    >
      <AvatarWithStatus
        initials={agent.avatar}
        roleColor={agent.avatarColor}
        status={agent.status}
        isPrimary={agent.isPrimary}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-foreground truncate">{agent.name}</span>
          {agent.isPrimary && (
            <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[9px] text-primary">
              Primary
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{agent.roleKo}</span>
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
    </DropdownMenuItem>
  )
}
