'use client'

import * as React from 'react'
import { Eye, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AvatarWithStatus } from '@/components/shared/avatar-with-status'
import { StatusBadge } from '@/components/shared/status-badge'
import { getAgentById } from '@/lib/mock-data'
import type { TmuxPane, PaneStatus } from '@/lib/types'

interface AgentPaneProps {
  pane: TmuxPane
}

const statusVariants: Record<PaneStatus, 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted'> = {
  'chat active': 'primary',
  'watch only': 'muted',
  'dispatch gated': 'warning',
  'idle': 'muted',
  'ready': 'success',
  'active': 'primary',
  'guarding': 'danger',
}

export function AgentPane({ pane }: AgentPaneProps) {
  const [command, setCommand] = React.useState(pane.currentCommand || '')
  const agent = getAgentById(pane.agentId)
  
  if (!agent) return null

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      {/* Header: Avatar + Role + Status */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <AvatarWithStatus
            initials={agent.avatar}
            roleColor={agent.avatarColor}
            size="sm"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {pane.subtitle}
              </span>
            </div>
            <span className="text-sm font-medium text-foreground">
              {pane.title}
            </span>
          </div>
        </div>
        <StatusBadge variant={statusVariants[pane.status]} size="sm">
          {pane.status}
        </StatusBadge>
      </div>

      {/* Role Info */}
      <div className="border-b border-border/50 px-3 py-2">
        <span className="text-[10px] text-muted-foreground">{pane.description}</span>
      </div>

      {/* Agent Assignment */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div>
          <span className="text-[10px] text-muted-foreground">
            {agent.roleKo === '지휘자' ? 'Orchestrator' : agent.role}
          </span>
          <div className="text-[10px] text-foreground">{agent.roleKo}</div>
        </div>
        {pane.status === 'idle' ? (
          <span className="text-[10px] text-muted-foreground">future slot</span>
        ) : (
          <span className="text-[10px] text-foreground">{agent.model}</span>
        )}
      </div>

      {/* Description / Current Task */}
      <div className="flex-1 px-3 py-2">
        <p className="text-[10px] text-muted-foreground line-clamp-2">
          {pane.status === 'idle' 
            ? `담당 agent 미정`
            : `실제 tmux send는 승인과 서버 env gate 이후에만 열립니다.`
          }
        </p>
      </div>

      {/* Command Input */}
      <div className="border-t border-border p-2">
        <div className="flex items-center gap-1">
          <Input
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder={pane.status === 'idle' ? '' : "codex 'command...'"}
            className="h-7 flex-1 bg-muted/30 font-mono text-[10px]"
            disabled={pane.status === 'idle'}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px]"
            disabled={pane.status === 'idle'}
          >
            <Eye className="h-3 w-3" />
            읽기
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px] text-primary"
            disabled={pane.status === 'idle'}
          >
            <Send className="h-3 w-3" />
            보내기
          </Button>
        </div>
      </div>
    </div>
  )
}
