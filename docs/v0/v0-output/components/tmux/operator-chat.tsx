'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AvatarWithStatus } from '@/components/shared/avatar-with-status'
import { getPrimaryAgent, sampleMessages } from '@/lib/mock-data'

export function OperatorChat() {
  const [input, setInput] = React.useState('')
  const primaryAgent = getPrimaryAgent()

  return (
    <div className="flex w-80 shrink-0 flex-col border-r border-border bg-card/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-medium text-foreground">Operator Chat</span>
        <span className="text-[10px] text-muted-foreground">
          {sampleMessages[sampleMessages.length - 1]?.agentId === 'chae-arin' 
            ? 'session_desktop_001'
            : ''}
        </span>
      </div>

      {/* Chat Section */}
      <div className="border-b border-border px-4 py-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-medium text-primary">사용자</span>
          </div>
          <p className="mt-1 text-xs text-foreground">
            문서에 맞춰 첫 구현 골격을 만들자. 토론으로 확대할 수 있게 경계도 살려줘.
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-medium text-muted-foreground">Orchestrator</span>
          </div>
          <p className="mt-1 text-xs text-foreground">
            protocol, provider stub, agent runtime stub, desktop board를 먼저 연결하고 실제 모델 호출은 막아둔다.
          </p>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex-1 px-4 py-3">
        <div className="mb-3 text-[10px] text-muted-foreground">
          main chat stays here
        </div>
        <div className="rounded-md bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
          small text / monitor first
        </div>
      </div>

      {/* tmux session info */}
      <div className="border-t border-border px-4 py-2 text-[10px]">
        <div className="text-muted-foreground">tmux session: ai-swarm</div>
        <div className="text-muted-foreground">runtime backend: DGX-02 gate / 4-10 panes</div>
        <div className="text-muted-foreground">send-keys: server env gate + approval required</div>
      </div>
    </div>
  )
}
