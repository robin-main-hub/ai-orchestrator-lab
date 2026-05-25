'use client'

import * as React from 'react'
import { MessageSquare, Swords, LayoutGrid, Command } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatusIndicator } from '@/components/layout/status-indicator'
import { sampleSystemStatus } from '@/lib/mock-data'

export type ViewType = 'conversation' | 'debate' | 'tmux'

interface TopNavProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  onCommandPalette: () => void
}

const views: { id: ViewType; label: string; labelKo: string; icon: React.ElementType }[] = [
  { id: 'conversation', label: 'Conversation', labelKo: '대화', icon: MessageSquare },
  { id: 'debate', label: 'Debate', labelKo: '토론', icon: Swords },
  { id: 'tmux', label: 'Tmux', labelKo: 'Tmux', icon: LayoutGrid },
]

export function TopNav({ currentView, onViewChange, onCommandPalette }: TopNavProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/50 px-4">
      {/* Left: Logo / Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <span className="font-mono text-xs font-bold text-primary">AI</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">AI Orchestrator Lab</span>
          <span className="text-[10px] text-muted-foreground">desktop command room</span>
        </div>
      </div>

      {/* Center: View Tabs */}
      <nav className="flex items-center gap-1 rounded-lg bg-muted/30 p-1">
        {views.map(view => {
          const Icon = view.icon
          const isActive = currentView === view.id
          return (
            <button
              key={view.id}
              onClick={() => onViewChange(view.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{view.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Right: Command Palette + Status */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCommandPalette}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <Command className="h-4 w-4" />
          <kbd className="hidden rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
            ⌘K
          </kbd>
        </Button>
        <StatusIndicator status={sampleSystemStatus} />
      </div>
    </header>
  )
}
