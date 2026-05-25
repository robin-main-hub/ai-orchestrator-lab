import { cn } from '@/lib/utils'
import { AvatarWithStatus } from '@/components/shared/avatar-with-status'
import { StatusBadge } from '@/components/shared/status-badge'
import { getAgentById } from '@/lib/mock-data'
import type { DebateRound, DebateStage } from '@/lib/types'

interface DebateRoundCardProps {
  round: DebateRound
  index: number
}

const stageVariants: Record<DebateStage, 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted'> = {
  '문제 정의': 'muted',
  '1차 제안': 'primary',
  '상호 비판': 'warning',
  '오케스트레이터 요약': 'success',
  '보안 라운드': 'danger',
  '최종 결정': 'primary',
  '코딩 패킷': 'success',
}

const tagVariants: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted'> = {
  '합의': 'success',
  '근거': 'primary',
  '반박': 'warning',
  '리스크': 'danger',
  '코딩 영향': 'muted',
}

export function DebateRoundCard({ round, index }: DebateRoundCardProps) {
  const agent = getAgentById(round.agentId)
  if (!agent) return null

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      {/* Header: Agent + Stage */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarWithStatus
            initials={agent.avatar}
            roleColor={agent.avatarColor}
            isPrimary={agent.isPrimary}
            size="sm"
          />
          <div>
            <span className="text-sm font-medium text-foreground">
              {agent.role}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {agent.roleKo}
            </span>
          </div>
        </div>
        <StatusBadge variant={stageVariants[round.stage]} size="md">
          {round.stage}
        </StatusBadge>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-4 py-2">
        {round.tags.map(tag => (
          <StatusBadge
            key={tag}
            variant={tagVariants[tag] || 'default'}
            size="sm"
          >
            {tag}
          </StatusBadge>
        ))}
      </div>

      {/* Content / Utterance */}
      <div className="flex-1 px-4 py-3">
        <p className="text-sm text-foreground leading-relaxed line-clamp-4">
          {round.utterance}
        </p>
      </div>

      {/* Footer: Timestamp */}
      <div className="flex items-center justify-between border-t border-border/50 px-4 py-2">
        <span className="text-[10px] text-muted-foreground">
          Round {index}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {round.timestamp.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}
