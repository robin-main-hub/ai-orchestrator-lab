'use client'

import * as React from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { DebateContext, DebateStage } from '@/lib/types'

interface DebateContextHeaderProps {
  context: DebateContext
  currentStage: DebateStage
  onStageChange: (stage: DebateStage) => void
}

const stageLabels: Record<DebateStage, string> = {
  '문제 정의': '문제 정의',
  '1차 제안': '1차 제안',
  '상호 비판': '상호 비판',
  '오케스트레이터 요약': '오케스트레이터 요약',
  '보안 라운드': '보안 라운드',
  '최종 결정': '최종 결정',
  '코딩 패킷': '코딩 패킷',
}

export function DebateContextHeader({
  context,
  currentStage,
  onStageChange,
}: DebateContextHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border bg-card/30">
      {/* Context Description */}
      <div className="flex items-start gap-4 border-b border-border/50 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Debate Context
            </span>
          </div>
          <h2 className="mt-1 text-sm font-semibold text-foreground line-clamp-1">
            {context.topic}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {context.userRequest}
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2">
          <FileText className="h-3.5 w-3.5" />
          패킷 반영
        </Button>
      </div>

      {/* Stage Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
        {context.stages.map((stage, i) => {
          const isActive = stage === currentStage
          const isPast = context.stages.indexOf(currentStage) > i
          
          return (
            <button
              key={stage}
              onClick={() => onStageChange(stage)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : isPast
                  ? 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  : 'text-muted-foreground/50 hover:bg-muted/30 hover:text-muted-foreground'
              )}
            >
              {stageLabels[stage]}
              {isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
