'use client'

import * as React from 'react'
import { ArrowRight, ChevronDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface HumanPeekMessage {
  id: string
  from: string
  to: string
  type: 'send' | 'yield'
  message: string
}

interface HumanPeekProps {
  messages: HumanPeekMessage[]
}

export function HumanPeek({ messages }: HumanPeekProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between border-b border-border px-4 py-2 hover:bg-muted/20">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">Human Peek</span>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                !isOpen && '-rotate-90'
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-2 p-3">
            {messages.map(msg => (
              <PeekMessage key={msg.id} message={msg} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

interface PeekMessageProps {
  message: HumanPeekMessage
}

function PeekMessage({ message }: PeekMessageProps) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      {/* Header: From -> To */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            message.type === 'send'
              ? 'bg-primary/15 text-primary'
              : 'bg-warning/15 text-warning'
          )}
        >
          {message.type}
        </span>
        <span className="text-xs font-medium text-foreground">{message.from}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">{message.to}</span>
      </div>

      {/* Message Content */}
      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
        {message.message}
      </p>
    </div>
  )
}
