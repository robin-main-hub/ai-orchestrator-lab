'use client'

import * as React from 'react'
import { Pencil, Trash2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AvatarWithStatus } from '@/components/shared/avatar-with-status'
import type { Agent } from '@/lib/types'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onSelect: () => void
}

const modelOptions = [
  'codex-session',
  'gpt-5.5-pro',
  'claude-opus-4-6',
  'claude-sonnet-4',
  'gpt-5-mini',
]

export function AgentCard({ agent, isSelected, onSelect }: AgentCardProps) {
  const [model, setModel] = React.useState(agent.model)

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 rounded-md border border-transparent p-2 transition-colors',
        isSelected
          ? 'border-primary/30 bg-primary/5'
          : 'hover:bg-muted/30'
      )}
    >
      {/* Top row: Avatar, Name, Actions */}
      <div className="flex items-start gap-2">
        <button onClick={onSelect} className="shrink-0">
          <AvatarWithStatus
            initials={agent.avatar}
            roleColor={agent.avatarColor}
            status={agent.status}
            isPrimary={agent.isPrimary}
            size="sm"
          />
        </button>

        <div className="min-w-0 flex-1">
          <button
            onClick={onSelect}
            className="flex items-center gap-1.5 text-left"
          >
            <span className="truncate text-sm font-medium text-foreground">
              {agent.role}
            </span>
            {agent.isPrimary && (
              <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[9px] font-medium text-primary">
                Primary
              </span>
            )}
          </button>
          <span className="text-[11px] text-muted-foreground">
            {agent.roleKo}
          </span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="flex items-center gap-2 pl-9">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <span className="max-w-[100px] truncate">{model}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {modelOptions.map(option => (
              <DropdownMenuItem
                key={option}
                onClick={() => setModel(option)}
                className={cn(
                  'text-xs',
                  option === model && 'bg-primary/10 text-primary'
                )}
              >
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status badge when active/online */}
        {(agent.status === 'active' || agent.status === 'online') && (
          <span className="text-[10px] text-status-online">in use</span>
        )}
      </div>
    </div>
  )
}
