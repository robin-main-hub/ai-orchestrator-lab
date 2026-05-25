'use client'

import * as React from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { ApprovalItem, ApprovalCategory } from '@/lib/types'

interface AssistantInboxProps {
  items: ApprovalItem[]
}

const categoryColors: Record<ApprovalCategory, string> = {
  '자동': 'text-muted-foreground',
  '질문': 'text-primary',
  '승인': 'text-status-online',
  '차단': 'text-destructive',
  '대화': 'text-warning',
}

export function AssistantInbox({ items }: AssistantInboxProps) {
  const pendingCount = items.filter(i => i.hasWaitingItem).length
  const totalTasks = items.reduce((sum, i) => sum + i.count, 0)

  return (
    <div className="shrink-0 border-t border-border bg-card/30">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-2">
        <span className="text-xs font-medium text-foreground">Assistant Inbox</span>
        <span className="text-[10px] text-muted-foreground">
          {totalTasks} tasks / {pendingCount} drafts / 0 approvals
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">Workitem first</span>
      </div>

      {/* Cards Strip */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 p-3">
          {items.map(item => (
            <InboxCard key={item.id} item={item} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

interface InboxCardProps {
  item: ApprovalItem
}

function InboxCard({ item }: InboxCardProps) {
  return (
    <div
      className={cn(
        'flex w-44 shrink-0 flex-col rounded-lg border border-border bg-card',
        item.hasWaitingItem && 'border-primary/40'
      )}
    >
      {/* Header */}
      <div className="border-b border-border/50 px-3 py-2">
        <span className={cn('text-xs font-medium', categoryColors[item.category])}>
          {item.category} / {item.count}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 px-3 py-2">
        <p className="text-[11px] font-medium text-foreground line-clamp-1">
          {item.title}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
          {item.description}
        </p>
      </div>

      {/* Actions */}
      {item.hasWaitingItem && (
        <div className="flex items-center gap-1 border-t border-border/50 p-1.5">
          <Button
            size="sm"
            className="h-6 flex-1 gap-1 bg-primary text-[10px] text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-3 w-3" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 flex-1 gap-1 text-[10px] text-muted-foreground"
          >
            <X className="h-3 w-3" />
            Archive
          </Button>
        </div>
      )}
    </div>
  )
}
