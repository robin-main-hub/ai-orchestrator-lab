import { cn } from '@/lib/utils'
import type { AgentStatus, RoleColor } from '@/lib/types'

interface AvatarWithStatusProps {
  initials: string
  roleColor: RoleColor
  status?: AgentStatus
  isPrimary?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const roleColorMap: Record<RoleColor, string> = {
  orchestrator: 'bg-role-orchestrator/20 text-role-orchestrator',
  architect: 'bg-role-architect/20 text-role-architect',
  builder: 'bg-role-builder/20 text-role-builder',
  reviewer: 'bg-role-reviewer/20 text-role-reviewer',
  expert: 'bg-role-expert/20 text-role-expert',
  companion: 'bg-role-companion/20 text-role-companion',
}

const statusColorMap: Record<AgentStatus, string> = {
  online: 'bg-status-online',
  offline: 'bg-status-offline',
  pending: 'bg-status-pending',
  idle: 'bg-status-idle',
  active: 'bg-status-active',
}

const sizeMap = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
}

const statusSizeMap = {
  sm: 'h-2 w-2 -bottom-0.5 -right-0.5 ring-1',
  md: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5 ring-2',
  lg: 'h-3 w-3 -bottom-0.5 -right-0.5 ring-2',
}

export function AvatarWithStatus({
  initials,
  roleColor,
  status,
  isPrimary = false,
  size = 'md',
  className,
}: AvatarWithStatusProps) {
  return (
    <div className={cn('relative inline-flex', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-lg font-mono font-medium',
          roleColorMap[roleColor],
          sizeMap[size],
          isPrimary && 'ring-2 ring-primary/60'
        )}
      >
        {initials}
      </div>
      {status && (
        <span
          className={cn(
            'absolute rounded-full ring-background',
            statusColorMap[status],
            statusSizeMap[size],
            status === 'active' && 'status-pulse'
          )}
        />
      )}
    </div>
  )
}
