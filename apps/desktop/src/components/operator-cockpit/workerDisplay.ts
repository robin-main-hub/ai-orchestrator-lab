import type {
  AgentRole,
  OperatorCockpitMemoryRecall,
  OperatorCockpitProviderRouting,
  OperatorCockpitWorkerFleet,
  WorkLane,
  WorkSurface,
} from "@ai-orchestrator/protocol";
import {
  getAgentToolBadgeLabels,
  getAgentToolProfileSummary,
} from "../../lib/agentToolProfiles";
import { formatModelDisplayName, providerDisplayLabel } from "../../lib/helpers";
import {
  fallbackStatusLabel,
  mirrorHealthLabel,
  trustBadgeLabel,
  workerStatusLabel,
} from "./presentation";
import { resolveOperatorWorkerDisplay as resolveBaseOperatorWorkerDisplay } from "../../lib/operatorWorkerDisplay";
export {
  normalizeOperatorWorkerPersonaKey as normalizeWorkerPersonaKey,
  resolveOperatorWorkerDisplay,
} from "../../lib/operatorWorkerDisplay";

const roleBriefs: Record<AgentRole, string> = {
  architect: "요구사항을 구조로 바꾸고, 구현 전에 위험과 경계를 정리합니다.",
  auditor: "범위, 근거, 정책 일치 여부를 독립적으로 점검합니다.",
  builder: "승인된 계획을 코드와 테스트 가능한 변경으로 옮깁니다.",
  companion: "사용자 맥락을 유지하며 질문, 기억, 일상 흐름을 보조합니다.",
  domain_expert: "도메인 지식을 불러와 답변의 전제와 전문 용어를 보강합니다.",
  executor: "승인된 실행을 터미널과 기록 흐름으로 안전하게 전달합니다.",
  external: "외부 협력 흐름을 정리하고 필요한 질문과 인계를 준비합니다.",
  mediator: "충돌하는 의견을 하나의 결정 초안으로 합칩니다.",
  memory_curator: "대화 기억을 선별하고, 저장/망각 후보의 근거를 정리합니다.",
  negotiator: "이해관계와 제안 조건을 비교해 협상 가능한 선택지를 만듭니다.",
  orchestrator: "작업 우선순위, 승인 흐름, 워커 간 인계를 정렬합니다.",
  researcher: "외부 정보와 출처 신뢰도를 조사해 근거 있는 요약을 만듭니다.",
  reviewer: "변경 의도, 회귀 위험, 빠진 검증을 검토합니다.",
  risk_officer: "최악 상황, 영향 범위, 되돌림 계획을 먼저 드러냅니다.",
  skeptic: "가정과 UX 결함을 공격적으로 찾아 반례를 제시합니다.",
  verifier: "테스트, 빌드, 증거가 실제 요구사항을 만족하는지 확인합니다.",
  watchdog: "장기 세션의 드리프트와 이상 신호를 감시합니다.",
};

const laneLabels: Record<WorkLane, string> = {
  approve: "승인",
  ask: "질문",
  auto: "자동 분류",
  blocked: "차단",
  check: "검토",
};

const surfaceLabels: Record<WorkSurface, string> = {
  coding_packet: "코딩 패킷",
  conversation: "대화",
  debate: "토론",
  execution_slot: "실행 슬롯",
  mobile: "모바일",
  notion: "노션",
  obsidian: "옵시디언",
  tmux: "터미널",
};

export function resolveOperatorWorkerSkillDisplay(role: AgentRole) {
  const summary = getAgentToolProfileSummary(role);
  return {
    boundaryLabel: summary.runtime.boundaryLabel,
    label: summary.label,
    tools: getAgentToolBadgeLabels(role).map(operatorToolLabel),
  };
}

function operatorToolLabel(label: string) {
  if (label === "Tmux 계획") return "터미널 계획";
  return label;
}

export function resolveOperatorWorkerDetailDisplay({
  memory,
  routing,
  worker,
}: {
  memory?: OperatorCockpitMemoryRecall;
  routing?: OperatorCockpitProviderRouting;
  worker: OperatorCockpitWorkerFleet;
}) {
  const identity = resolveBaseOperatorWorkerDisplay(worker);
  const skills = resolveOperatorWorkerSkillDisplay(worker.role);

  return {
    identity,
    memory: createWorkerMemoryDisplay(memory),
    model: createWorkerModelDisplay(routing),
    recent: createWorkerRecentDisplay(worker),
    roleBrief: roleBriefs[worker.role],
    skills,
  };
}

export function formatOperatorModelLabel(value?: string) {
  const model = value?.trim();
  if (!model) return "모델 연결 대기";
  const displayName = formatModelDisplayName(model);
  return humanizeIdentifier(displayName.replace(/^model[_\s-]?/i, ""));
}

export function formatOperatorProviderLabel(value?: string) {
  const provider = value?.trim();
  if (!provider) return "공급자 대기";

  const knownLabel = providerDisplayLabel(provider);
  if (knownLabel !== provider) return knownLabel;

  const cleaned = provider.replace(/^provider[_\s-]?/i, "").replace(/[_-]+/g, " ");
  return providerDisplayLabel(humanizeIdentifier(cleaned));
}

function createWorkerMemoryDisplay(memory?: OperatorCockpitMemoryRecall) {
  if (!memory) {
    return {
      detail: "기억 스냅샷 연결 대기",
      primary: "기억 연결 대기",
      reasons: ["조회 근거 대기"],
      warningLabel: "충돌 점검 대기",
    };
  }

  const authorityLabel = memory.macBookAuthorityEnabled ? "MacBook 기준 기억" : "기억 기준 확인 필요";
  const mirrorLabel = `DGX ${mirrorHealthLabel(memory.dgxMirrorHealth)}`;
  const warningCount = memory.contradictionWarnings.length;

  return {
    detail: warningCount > 0 ? `충돌 경고 ${warningCount}건` : "충돌 경고 없음",
    primary: `${authorityLabel} · ${mirrorLabel}`,
    reasons: memory.contextReasons.length > 0 ? memory.contextReasons.slice(0, 3) : ["대화 기억 후보 대기"],
    warningLabel: warningCount > 0 ? "검토 필요" : "정상",
  };
}

function createWorkerModelDisplay(routing?: OperatorCockpitProviderRouting) {
  if (!routing) {
    return {
      badges: ["경로 대기"],
      detail: "라우팅 스냅샷 연결 대기",
      routeLabel: "공급자 대기 / 모델 연결 대기",
    };
  }

  return {
    badges: [
      fallbackStatusLabel(routing.fallbackStatus),
      trustBadgeLabel(routing.trustBadge),
      routing.readinessLabel,
      routing.secretPolicyLabel,
    ].filter((label): label is string => Boolean(label)),
    detail: routing.routeLabel ?? "현재 선택 경로",
    routeLabel: `${formatOperatorProviderLabel(routing.providerLabel)} / ${formatOperatorModelLabel(routing.selectedModelId)}`,
  };
}

function createWorkerRecentDisplay(worker: OperatorCockpitWorkerFleet) {
  const scope = [worker.surface ? surfaceLabels[worker.surface] : undefined, worker.lane ? laneLabels[worker.lane] : undefined]
    .filter(Boolean)
    .join(" · ");
  const location = worker.branch
    ? `브랜치 ${worker.branch}`
    : worker.worktree
      ? formatOperatorWorktreeLabel(worker.worktree)
      : "실시간 관찰";

  return {
    detail: worker.blockedReason ?? (scope || "최근 신호를 실시간으로 반영 중"),
    location,
    statusLabel: workerStatusLabel(worker.status),
  };
}

function humanizeIdentifier(value: string) {
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return value;
  return cleaned.replace(/\b[a-z][a-z0-9.]*/gi, (word) => {
    if (word.length <= 2 && word === word.toUpperCase()) return word;
    if (/[A-Z]/.test(word.slice(1))) return word;
    return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
  });
}

export function formatOperatorWorktreeLabel(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "작업공간 대기";
  return `작업공간 ${lastPathSegment(trimmed)}`;
}

function lastPathSegment(value: string) {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? value;
}
