'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ConversationHeader } from '@/components/conversation/conversation-header'
import { MessageThread } from '@/components/conversation/message-thread'
import { ConversationComposer } from '@/components/conversation/conversation-composer'
import { ApprovalQueue } from '@/components/conversation/approval-queue'
import { sampleMessages, sampleApprovalItems } from '@/lib/mock-data'
import type { Agent, Message } from '@/lib/types'

interface ConversationViewProps {
  agent: Agent
  onSwitchAgent: () => void
}

export function ConversationView({ agent, onSwitchAgent }: ConversationViewProps) {
  const [messages, setMessages] = React.useState<Message[]>(sampleMessages)

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      agentId: 'user',
      content,
      timestamp: new Date(),
      type: 'user',
    }
    setMessages(prev => [...prev, newMessage])

    // Simulate agent response
    setTimeout(() => {
      const agentResponse: Message = {
        id: `msg-${Date.now() + 1}`,
        agentId: agent.id,
        content: `이해했습니다. "${content}"에 대해 처리하겠습니다.`,
        timestamp: new Date(),
        type: 'agent',
      }
      setMessages(prev => [...prev, agentResponse])
    }, 1000)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with Agent Info and Switcher */}
      <ConversationHeader
        agent={agent}
        onSwitchAgent={onSwitchAgent}
        sessionId="session_desktop_001"
      />

      {/* Message Thread */}
      <div className="flex-1 overflow-hidden">
        <MessageThread messages={messages} currentAgentId={agent.id} />
      </div>

      {/* Composer */}
      <ConversationComposer
        agent={agent}
        onSendMessage={handleSendMessage}
      />

      {/* Approval Queue (collapsible strip) */}
      <ApprovalQueue items={sampleApprovalItems} />
    </div>
  )
}
