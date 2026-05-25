'use client'

import { cn } from '@/lib/utils'
import { AvatarWithStatus } from '@/components/shared/avatar-with-status'
import { getAgentById } from '@/lib/mock-data'
import type { Message } from '@/lib/types'
import { useEffect, useState } from 'react'

interface MessageBubbleProps {
  message: Message
  agentId: string
}

export function MessageBubble({ message, agentId }: MessageBubbleProps) {
  if (message.type === 'system') {
    return <SystemMessage content={message.content} timestamp={message.timestamp} />
  }

  if (message.type === 'user') {
    return <UserMessage content={message.content} timestamp={message.timestamp} />
  }

  // Agent message
  const agent = getAgentById(message.agentId) || getAgentById(agentId)
  if (!agent) return null

  return (
    <div className="flex gap-3">
      <AvatarWithStatus
        initials={agent.avatar}
        roleColor={agent.avatarColor}
        status={agent.status}
        isPrimary={agent.isPrimary}
        size="md"
      />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{agent.name}</span>
          <span className="text-[10px] text-muted-foreground">
            <FormattedTime date={message.timestamp} />
          </span>
        </div>
        <div className="rounded-lg rounded-tl-none border border-border bg-card p-3">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  )
}

interface UserMessageProps {
  content: string
  timestamp: Date
}

function UserMessage({ content, timestamp }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] space-y-1">
        <div className="flex items-center justify-end gap-2">
          <span className="text-[10px] text-muted-foreground">
            <FormattedTime date={timestamp} />
          </span>
          <span className="text-sm font-medium text-foreground">사용자</span>
        </div>
        <div className="rounded-lg rounded-tr-none bg-primary/15 p-3">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        </div>
      </div>
    </div>
  )
}

interface SystemMessageProps {
  content: string
  timestamp: Date
}

function SystemMessage({ content, timestamp }: SystemMessageProps) {
  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-2 rounded-full bg-muted/30 px-4 py-1.5">
        <span className="text-xs text-muted-foreground">{content}</span>
        <span className="text-[10px] text-muted-foreground/70">
          <FormattedTime date={timestamp} />
        </span>
      </div>
    </div>
  )
}

// Client-side time formatting to avoid hydration mismatch
function useFormattedTime(date: Date): string {
  const [formatted, setFormatted] = useState('')
  
  useEffect(() => {
    setFormatted(date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    }))
  }, [date])
  
  return formatted
}

function FormattedTime({ date }: { date: Date }) {
  const time = useFormattedTime(date)
  return <>{time}</>
}
