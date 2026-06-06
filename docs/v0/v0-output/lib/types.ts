// AI Orchestrator Lab - Type Definitions

export type AgentCategory = 'core' | 'specialist' | 'companion'

export type AgentStatus = 'online' | 'offline' | 'pending' | 'idle' | 'active'

export type RoleColor = 
  | 'orchestrator' 
  | 'architect' 
  | 'builder' 
  | 'reviewer' 
  | 'expert' 
  | 'companion'

export interface Agent {
  id: string
  name: string           // Korean name e.g., "채아린"
  nameEn: string         // English name e.g., "Chae Arin"
  role: string           // English role e.g., "Orchestrator"
  roleKo: string         // Korean role e.g., "지휘자"
  model: string          // e.g., "codex-session", "gpt-5.5-pro"
  avatar: string         // Initials (2 chars)
  avatarColor: RoleColor
  isPrimary: boolean     // true only for 채아린
  canDelegate: boolean   // true for orchestrator/companion only
  category: AgentCategory
  status: AgentStatus
  description?: string
}

export interface Message {
  id: string
  agentId: string
  content: string
  timestamp: Date
  type: 'user' | 'agent' | 'system'
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  name: string
  type: 'file' | 'image' | 'code'
  size?: number
}

export interface Session {
  id: string
  name: string
  agentId: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
}

// Debate View Types
export type DebateStage = 
  | '문제 정의'
  | '1차 제안'
  | '상호 비판'
  | '오케스트레이터 요약'
  | '보안 라운드'
  | '최종 결정'
  | '코딩 패킷'

export interface DebateRound {
  id: string
  agentId: string
  stage: DebateStage
  tags: string[]
  utterance: string
  timestamp: Date
}

export interface DebateContext {
  id: string
  topic: string
  userRequest: string
  stages: DebateStage[]
  currentStage: DebateStage
  rounds: DebateRound[]
}

// Tmux Swarm Types
export type PaneStatus = 'chat active' | 'watch only' | 'dispatch gated' | 'idle' | 'ready' | 'active' | 'guarding'

export interface TmuxPane {
  id: string
  paneNumber: number
  agentId: string
  title: string
  subtitle: string
  status: PaneStatus
  description: string
  currentCommand?: string
  output?: string
}

export interface TmuxSession {
  id: string
  name: string
  panes: TmuxPane[]
  maxPanes: number
}

// Sidebar Types
export interface MementoStat {
  label: string
  labelKo: string
  value: number | string
  type: 'count' | 'text'
}

export interface RecallTrace {
  id: string
  title: string
  description: string
  relevance: number // percentage
  isUsed: boolean
}

export interface MementoContext {
  activeMemories: number
  heldBack: number
  relatedLinks: number
  stats: MementoStat[]
  traces: RecallTrace[]
}

// Approval Queue Types
export type ApprovalCategory = 
  | '자동'
  | '질문'
  | '승인'
  | '차단'
  | '대화'

export interface ApprovalItem {
  id: string
  category: ApprovalCategory
  title: string
  description: string
  priority: 'low' | 'normal' | 'high'
  count: number
  hasWaitingItem: boolean
}

// System Status Types
export type SystemHealth = 'healthy' | 'degraded' | 'error'

export interface SystemStatus {
  dgxMain: 'online' | 'offline'
  dgxLocal: 'online' | 'offline'
  eventStorage: 'available' | 'unavailable'
  providers: {
    active: number
    total: number
  }
  health: SystemHealth
  lastChecked: Date
}

// Delegation Chip Types
export type DelegationAction = 
  | '토론 전환'
  | '패킷 생성'
  | '실행 슬롯'
  | '백업 상태'
  | 'External Ingress'

export interface DelegationChip {
  action: DelegationAction
  enabled: boolean
  shortcut?: string
}

// Command Palette Types
export interface CommandItem {
  id: string
  label: string
  labelKo?: string
  shortcut?: string
  category: 'agent' | 'action' | 'navigation'
  agentId?: string
  action?: () => void
}
