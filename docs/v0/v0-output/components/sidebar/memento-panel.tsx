'use client'

import * as React from 'react'
import { Plus, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { MementoContext, RecallTrace } from '@/lib/types'

interface MementoPanelProps {
  context: MementoContext
}

export function MementoPanel({ context }: MementoPanelProps) {
  const [isOpen, setIsOpen] = React.useState(true)

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
              Memento
            </button>
          </CollapsibleTrigger>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="space-y-4 p-3">
            {/* Auto-load indicator */}
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-foreground">자동 불러오기</span>
              <span className="text-[10px] text-muted-foreground">
                신뢰된 프로바이더라 관련 기억을 자동으로 불러 옴
              </span>
            </div>

            {/* Stats Grid (2x4) */}
            <div className="grid grid-cols-2 gap-1.5">
              {context.stats.slice(0, 8).map((stat, i) => (
                <StatCard
                  key={i}
                  label={stat.label}
                  labelKo={stat.labelKo}
                  value={stat.value}
                />
              ))}
            </div>

            {/* Activate Stats Row */}
            <div className="grid grid-cols-4 gap-1.5 border-t border-border pt-3">
              <MiniStat label="기억" value={5} />
              <MiniStat label="활성" value={3} />
              <MiniStat label="관계" value={1} />
              <MiniStat label="경리" value={1} />
            </div>

            {/* Memory Context */}
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Memory Context
              </div>
              <div className="mt-1 text-xs text-foreground">
                {context.activeMemories} active memories, {context.heldBack} held back, {context.relatedLinks} related links
              </div>
            </div>

            {/* Recall Trace */}
            <RecallTraceList traces={context.traces} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

interface StatCardProps {
  label: string
  labelKo: string
  value: string | number
}

function StatCard({ label, labelKo, value }: StatCardProps) {
  return (
    <div className="rounded-md bg-muted/30 px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xs font-medium text-foreground">{labelKo}</div>
    </div>
  )
}

interface MiniStatProps {
  label: string
  value: number
}

function MiniStat({ label, value }: MiniStatProps) {
  return (
    <div className="flex flex-col items-center rounded-md bg-muted/20 py-1.5">
      <span className="text-sm font-semibold text-foreground">{value}</span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  )
}

interface RecallTraceListProps {
  traces: RecallTrace[]
}

function RecallTraceList({ traces }: RecallTraceListProps) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Recall Trace</span>
            <span className="text-muted-foreground">{traces.length}</span>
          </div>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-1 space-y-1">
          {traces.map(trace => (
            <div
              key={trace.id}
              className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground truncate">
                    {trace.title}
                  </span>
                  {trace.isUsed && (
                    <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[9px] text-primary">
                      사용됨
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                  {trace.description}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {trace.relevance}%
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
