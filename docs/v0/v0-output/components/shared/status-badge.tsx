import { cn } from '@/lib/utils'

type BadgeVariant = 
  | 'default' 
  | 'primary' 
  | 'success' 
  | 'warning' 
  | 'danger' 
  | 'muted'
  | 'orchestrator'
  | 'architect'
  | 'builder'
  | 'reviewer'
  | 'expert'
  | 'companion'

interface StatusBadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: 'sm' | 'md'
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-secondary text-secondary-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted/50 text-muted-foreground',
  orchestrator: 'bg-role-orchestrator/15 text-role-orchestrator',
  architect: 'bg-role-architect/15 text-role-architect',
  builder: 'bg-role-builder/15 text-role-builder',
  reviewer: 'bg-role-reviewer/15 text-role-reviewer',
  expert: 'bg-role-expert/15 text-role-expert',
  companion: 'bg-role-companion/15 text-role-companion',
}

const sizeStyles = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
}

export function StatusBadge({
  children,
  variant = 'default',
  size = 'sm',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  )
}
