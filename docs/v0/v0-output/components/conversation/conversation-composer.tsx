'use client'

import * as React from 'react'
import { Paperclip, Send, Swords, Package, Play, Database, Send as TelegramIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { delegationChips } from '@/lib/mock-data'
import type { Agent, DelegationAction } from '@/lib/types'

interface ConversationComposerProps {
  agent: Agent
  onSendMessage: (content: string) => void
}

const delegationIcons: Record<DelegationAction, React.ElementType> = {
  '토론 전환': Swords,
  '패킷 생성': Package,
  '실행 슬롯': Play,
  '백업 상태': Database,
  'Telegram': TelegramIcon,
}

export function ConversationComposer({
  agent,
  onSendMessage,
}: ConversationComposerProps) {
  const [value, setValue] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    onSendMessage(value.trim())
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Only show delegation chips for agents that can delegate (채아린 or companions)
  const showDelegationChips = agent.canDelegate

  return (
    <div className="shrink-0 border-t border-border bg-card/50">
      {/* Delegation Chips (only for 채아린/companion) */}
      {showDelegationChips && (
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
          {delegationChips.map(chip => {
            const Icon = delegationIcons[chip.action]
            return (
              <button
                key={chip.action}
                disabled={!chip.enabled}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  chip.enabled
                    ? 'bg-muted/50 text-foreground hover:bg-muted hover:text-primary'
                    : 'bg-muted/20 text-muted-foreground cursor-not-allowed'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {chip.action}
                {chip.shortcut && (
                  <kbd className="ml-1 rounded border border-border/50 bg-background/50 px-1 py-0.5 text-[9px] text-muted-foreground">
                    {chip.shortcut}
                  </kbd>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4">
        {/* Attachment Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* Text Input */}
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${agent.name}에게 말 걸기`}
            className="min-h-[44px] max-h-32 resize-none bg-muted/30 pr-12"
            rows={1}
          />
          <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">
            첨부 0/5
          </div>
        </div>

        {/* Send Button */}
        <Button
          type="submit"
          disabled={!value.trim()}
          className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Send className="h-4 w-4" />
          보내기
        </Button>
      </form>
    </div>
  )
}
