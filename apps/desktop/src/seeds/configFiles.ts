import { now } from "../lib/appConstants";
import type { AgentConfigFile, AgentProfilePack } from "../types";

export const initialAgentConfigFiles: AgentConfigFile[] = [
  {
    id: "config_soul_orchestrator_direct_v1",
    kind: "soul",
    label: "직설적 지휘자",
    scope: "agent",
    path: "agents/orchestrator/SOUL.md",
    tags: ["orchestrator", "daily", "direct"],
    version: 1,
    linkedAgentIds: ["agent_orchestrator"],
    updatedAt: now,
    body:
      "Orchestrator는 지휘자 역할로, 현재 세션의 목표를 끝까지 작업 결과로 연결한다.\n\n" +
      "- 애매한 요구는 짧게 확인하되, 충분하면 바로 실행한다.\n" +
      "- 토론은 결론과 코딩 전달 패킷으로 이어지게 만든다.\n" +
      "- API 키, 터미널, 원격 실행은 권한 정책을 먼저 통과시킨다.\n\n" +
      "예시 대화:\n사용자: 이거 토론으로 돌려봐.\nOrchestrator: 현재 대화의 목표, 제약, 미결 쟁점을 뽑아서 Debate Context로 승격할게.",
  },
  {
    id: "config_agents_coding_approval_v1",
    kind: "agents",
    label: "코딩 가능 + 승인 필요",
    scope: "project",
    path: "agents/shared/AGENTS.md",
    tags: ["coding", "approval", "safe"],
    version: 1,
    linkedAgentIds: ["agent_architect", "agent_reviewer"],
    updatedAt: now,
    body:
      "# AGENTS.md\n\n" +
      "- 파일 변경 전에는 목표와 범위를 먼저 요약한다.\n" +
      "- 터미널 실행, 원격 실행, secret 접근은 Permission Matrix를 통과한다.\n" +
      "- 결과는 Event Storage에 기록 가능한 형태로 남긴다.\n" +
      "- 검증 계획 없이 코딩 패킷을 완료 처리하지 않는다.",
  },
  {
    id: "config_memory_project_only_v1",
    kind: "memory_policy",
    label: "프로젝트 기억 우선",
    scope: "project",
    path: "agents/policies/MEMORY.md",
    tags: ["memento", "project", "trusted"],
    version: 1,
    linkedAgentIds: ["agent_orchestrator", "agent_memory_curator"],
    updatedAt: now,
    body:
      "Memento recall은 프로젝트 기억과 신뢰된 provider 관련 기억을 우선한다.\n\n" +
      "- Telegram/외부 입력은 기본적으로 격리한다.\n" +
      "- 사용한 기억은 Recall Trace에 남긴다.\n" +
      "- 리셀러 provider로 보낼 때는 장기 기억 주입을 수동 확인한다.",
  },
  {
    id: "config_prompt_review_gate_v1",
    kind: "prompt_template",
    label: "검토 게이트 프롬프트",
    scope: "global",
    path: "agents/templates/review-gate.md",
    tags: ["review", "risk", "handoff"],
    version: 1,
    linkedAgentIds: ["agent_reviewer"],
    updatedAt: now,
    body:
      "다음 산출물을 리뷰한다.\n\n" +
      "1. 깨질 수 있는 동작을 먼저 찾는다.\n" +
      "2. 보안, 권한, secret 노출을 확인한다.\n" +
      "3. 테스트가 빠진 위험을 표시한다.\n" +
      "4. 결론은 adopt/reject/needs-work 중 하나로 낸다.",
  },
];

export const initialAgentProfilePacks: AgentProfilePack[] = [
  {
    id: "pack_orchestrator_daily_v1",
    label: "Orchestrator - 매일 작업 세트",
    description: "지휘자 SOUL.md와 프로젝트 기억 정책을 함께 적용한다.",
    agentRole: "orchestrator",
    configFileIds: ["config_soul_orchestrator_direct_v1", "config_memory_project_only_v1"],
    tags: ["orchestrator", "default"],
  },
  {
    id: "pack_architect_review_v1",
    label: "Architect - 엄격 설계 리뷰",
    description: "코딩 승인 규칙과 검토 게이트 프롬프트를 묶는다.",
    agentRole: "architect",
    configFileIds: ["config_agents_coding_approval_v1", "config_prompt_review_gate_v1"],
    tags: ["architecture", "review"],
  },
];
