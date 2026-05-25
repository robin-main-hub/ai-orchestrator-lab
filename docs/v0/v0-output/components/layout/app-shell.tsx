'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { TopNav, type ViewType } from '@/components/layout/top-nav'
import { Sidebar } from '@/components/sidebar/sidebar'
import { ConversationView } from '@/components/conversation/conversation-view'
import { DebateView } from '@/components/debate/debate-view'
import { TmuxSwarmView } from '@/components/tmux/tmux-swarm-view'
import { CommandPalette, useCommandPalette } from '@/components/shared/command-palette'
import { agents, getPrimaryAgent } from '@/lib/mock-data'
import type { Agent } from '@/lib/types'

export function AppShell() {
  const [currentView, setCurrentView] = React.useState<ViewType>('conversation')
  const [currentAgent, setCurrentAgent] = React.useState<Agent>(getPrimaryAgent())
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } = useCommandPalette()

  const handleSelectAgent = (agent: Agent) => {
    setCurrentAgent(agent)
    // When selecting an agent, switch to conversation view
    if (currentView !== 'conversation') {
      setCurrentView('conversation')
    }
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Top Navigation */}
      <TopNav
        currentView={currentView}
        onViewChange={setCurrentView}
        onCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main View */}
        <main className="flex-1 overflow-hidden">
          {currentView === 'conversation' && (
            <ConversationView
              agent={currentAgent}
              onSwitchAgent={() => setCommandPaletteOpen(true)}
            />
          )}
          {currentView === 'debate' && <DebateView />}
          {currentView === 'tmux' && <TmuxSwarmView />}
        </main>

        {/* Sidebar */}
        <Sidebar
          agents={agents}
          currentAgentId={currentAgent.id}
          onSelectAgent={handleSelectAgent}
        />
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSelectAgent={handleSelectAgent}
      />
    </div>
  )
}
