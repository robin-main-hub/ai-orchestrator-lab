'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { DebateRoundCard } from '@/components/debate/debate-round-card'
import type { DebateRound } from '@/lib/types'

interface DebateRoundListProps {
  rounds: DebateRound[]
}

export function DebateRoundList({ rounds }: DebateRoundListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
      {rounds.map((round, i) => (
        <DebateRoundCard key={round.id} round={round} index={i + 1} />
      ))}
    </div>
  )
}
