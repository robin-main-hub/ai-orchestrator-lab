'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { ApprovalItem, ApprovalCategory } from '@/lib/types'

interface ApprovalQueueProps {
  items: ApprovalItem[]
}

const categoryColors: Record<ApprovalCategory, string> = {
  '자동': 'text-muted-foreground',
  '질문': 'text-primary',
  '승인': 'text-status-online',
  '차단': 'text-destructive',
  '대화': 'text-warning',
}

export function ApprovalQueue({ items }: ApprovalQueueProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const pendingCount = items.filter(i => i.hasWaitingItem).length
  const totalTasks = items.reduce((sum, i) => sum + i.count, 0)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-t border-border bg-card/30">
        {/* Header Strip */}
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-4 py-2 hover:bg-muted/20">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-foreground">
                Assistant Inbox
              </span>
              <span className="text-[10px] text-muted-foreground">
                {totalTasks} tasks / {pendingCount} pending
              </span>
            </div>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        {/* Collapsed: Horizontal preview strip */}
        {!isOpen && (
          <ScrollArea className="w-full">
            <div className="flex gap-2 px-4 pb-3">
              {items.map(item => (
                <ApprovalChip key={item.id} item={item} />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Expanded: Full cards */}
        <CollapsibleContent>
          <ScrollArea className="w-full">
            <div className="flex gap-3 p-4 pt-2">
              {items.map(item => (
                <ApprovalCard key={item.id} item={item} />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

interface ApprovalChipProps {
  item: ApprovalItem
}

function ApprovalChip({ item }: ApprovalChipProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5',
        item.hasWaitingItem && 'border-primary/50 bg-primary/5'
      )}
    >
      <span className={cn('text-xs font-medium', categoryColors[item.category])}>
        {item.category} / {item.count}
      </span>
      {item.hasWaitingItem && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      )}
    </div>
  )
}

interface ApprovalCardProps {
  item: ApprovalItem
}

function ApprovalCard({ item }: ApprovalCardProps) {
  return (
    <div
      className={cn(
        'flex w-52 shrink-0 flex-col rounded-lg border border-border bg-card',
        item.hasWaitingItem && 'border-primary/40'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className={cn('text-xs font-medium', categoryColors[item.category])}>
          {item.category} / {item.count}
        </span>
        {item.priority === 'high' && (
          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-medium text-warning">
            high
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-3 py-2">
        <p className="text-xs font-medium text-foreground line-clamp-1">
          {item.title}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
          {item.description}
        </p>
      </div>

      {/* Actions */}
      {item.hasWaitingItem && (
        <div className="flex items-center gap-1 border-t border-border p-2">
          <Button
            size="sm"
            className="h-7 flex-1 gap-1 bg-primary text-primary-foreground text-xs hover:bg-primary/90"
          >
            <Check className="h-3 w-3" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 flex-1 gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
            Archive
          </Button>
        </div>
      )}

      {!item.hasWaitingItem && (
        <div className="border-t border-border px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            No waiting item
          </span>
        </div>
      )}
    </div>
  )
}
