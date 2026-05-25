'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { DebateContextHeader } from '@/components/debate/debate-context-header'
import { DebateRoundList } from '@/components/debate/debate-round-list'
import { StatusHub } from '@/components/debate/status-hub'
import { HumanPeek } from '@/components/debate/human-peek'
import { AssistantInbox } from '@/components/debate/assistant-inbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  sampleDebateContext,
  sampleDebateRounds,
  sampleApprovalItems,
  sampleSystemStatus,
} from '@/lib/mock-data'
import type { DebateStage } from '@/lib/types'

const humanPeekMessages = [
  {
    id: 'peek-1',
    from: 'Orchestrator',
    to: 'Architect',
    type: 'send' as const,
    message: 'Debate Context를 전달하고 1차 구조 제안을 요청',
  },
  {
    id: 'peek-2',
    from: 'Orchestrator',
    to: 'Reviewer',
    type: 'send' as const,
    message: '리스크/누락/보안 경계 검토 요청',
  },
  {
    id: 'peek-3',
    from: 'Reviewer',
    to: 'Orchestrator',
    type: 'yield' as const,
    message: '7개 라운드, 2개 최초 기준으로 결과 생성',
  },
]

export function DebateView() {
  const [currentStage, setCurrentStage] = React.useState<DebateStage>(
    sampleDebateContext.currentStage
  )

  // Filter rounds by current stage (or show all)
  const filteredRounds = sampleDebateRounds

  return (
    <div className="flex h-full flex-col">
      {/* Debate Context Header with Stage Tabs */}
      <DebateContextHeader
        context={sampleDebateContext}
        currentStage={currentStage}
        onStageChange={setCurrentStage}
      />

      {/* Main Content: Rounds + Side Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Debate Rounds */}
        <div className="flex-1 overflow-hidden border-r border-border">
          <ScrollArea className="h-full">
            <DebateRoundList rounds={filteredRounds} />
          </ScrollArea>
        </div>

        {/* Right: Status Hub + Human Peek */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4">
              <StatusHub status={sampleSystemStatus} />
              <HumanPeek messages={humanPeekMessages} />
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Bottom: Assistant Inbox */}
      <AssistantInbox items={sampleApprovalItems} />
    </div>
  )
}
