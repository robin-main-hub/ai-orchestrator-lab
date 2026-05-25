'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from '@/components/conversation/message-bubble'
import type { Message } from '@/lib/types'

interface MessageThreadProps {
  messages: Message[]
  currentAgentId: string
}

export function MessageThread({ messages, currentAgentId }: MessageThreadProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div className="flex flex-col gap-4 p-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map(message => (
            <MessageBubble
              key={message.id}
              message={message}
              agentId={currentAgentId}
            />
          ))
        )}
      </div>
    </ScrollArea>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <span className="font-mono text-lg font-bold text-primary">AI</span>
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">
        Start a conversation
      </h3>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        Type a message below to begin chatting with your agent.
        <br />
        Use <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 text-[10px]">⌘K</kbd> to switch agents.
      </p>
    </div>
  )
}
