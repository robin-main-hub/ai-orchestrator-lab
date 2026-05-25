'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { OperatorChat } from '@/components/tmux/operator-chat'
import { AgentPaneGrid } from '@/components/tmux/agent-pane-grid'
import { sampleTmuxPanes, sampleTmuxSession } from '@/lib/mock-data'

export function TmuxSwarmView() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card/30 px-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">tmux 창 점검</span>
          <span className="text-xs font-medium text-foreground">
            {sampleTmuxSession.id}
          </span>
          <span className="text-[10px] text-muted-foreground">3/4</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {sampleTmuxPanes.length} panes / max {sampleTmuxSession.maxPanes}
        </span>
      </header>

      {/* Main Content: Operator Chat + Pane Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Operator Chat */}
        <OperatorChat />

        {/* Right: Agent Pane Grid */}
        <div className="flex-1 overflow-hidden">
          <AgentPaneGrid panes={sampleTmuxPanes} />
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-card/30 px-4 text-[10px]">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            Event Storage mapping
          </span>
          <span className="text-foreground">
            intent / capture events ready
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            Permission + Redaction
          </span>
          <span className="text-foreground">
            승인 전 기록, 저장 전 제거
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            현재 서버 응답
          </span>
          <span className="text-foreground">
            DGX-02 tmux 게이트 준비됨. 실제 send-keys는 서버 env gate의 승인 이후에만 실행됩니다.
          </span>
        </div>
      </footer>
    </div>
  )
}
