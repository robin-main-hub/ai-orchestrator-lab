import type { AgentRole, OperatorCockpitWorkerFleet } from "@ai-orchestrator/protocol";

export const operatorPersonaKeyByWorkerId: Record<string, string> = {
  agent_architect: "architect",
  agent_auditor: "auditor",
  agent_builder: "builder",
  agent_chaerin: "chae_arin",
  agent_domain_expert: "domain_expert",
  agent_executor: "executor",
  agent_external: "external",
  agent_mediator: "mediator",
  agent_memory_curator: "memory_curator",
  agent_negotiator: "negotiator",
  agent_orchestrator: "orchestrator",
  agent_researcher: "researcher",
  agent_reviewer: "reviewer",
  agent_risk_officer: "risk_officer",
  agent_skeptic: "skeptic",
  agent_skeptic_yohane: "yohane",
  agent_verifier: "verifier",
  agent_watchdog: "watchdog",
};

export const operatorPersonaNameByKey: Record<string, string> = {
  architect: "오시노 시노부",
  auditor: "카스가노 소라",
  builder: "히라사와 유이",
  chae_arin: "채아린",
  domain_expert: "헤르타",
  executor: "렘",
  external: "카츠라기 미사토",
  mediator: "니코 로빈",
  memory_curator: "아야나미 레이",
  negotiator: "스파클",
  orchestrator: "마키마",
  researcher: "마오마오",
  reviewer: "시노미야 카구야",
  risk_officer: "C.C.",
  skeptic: "소류 아스카 랭그레이",
  verifier: "마키세 크리스",
  watchdog: "프리렌",
  yohane: "츠시마 요시코",
};

export const operatorKoreanRoleLabelByRole: Record<AgentRole, string> = {
  architect: "설계자",
  auditor: "감사자",
  builder: "구현자",
  companion: "동행자",
  domain_expert: "도메인 전문가",
  executor: "실행자",
  external: "외부 협력자",
  mediator: "중재자",
  memory_curator: "기억 관리자",
  negotiator: "협상가",
  orchestrator: "지휘자",
  researcher: "조사자",
  reviewer: "검토자",
  risk_officer: "리스크 책임자",
  skeptic: "비판자",
  verifier: "검증자",
  watchdog: "감시자",
};

export const operatorPersonaRoleOverrideByKey: Record<string, string> = {
  skeptic: "UX 비판자",
  yohane: "4차원 아이디어 뱅크",
};

export function normalizeOperatorWorkerPersonaKey(workerId: string, role: AgentRole) {
  if (operatorPersonaKeyByWorkerId[workerId]) return operatorPersonaKeyByWorkerId[workerId];
  if (operatorPersonaNameByKey[workerId]) return workerId;

  const withoutAgentPrefix = workerId.startsWith("agent_") ? workerId.slice("agent_".length) : workerId;
  if (operatorPersonaNameByKey[withoutAgentPrefix]) return withoutAgentPrefix;

  return role;
}

export function resolveOperatorWorkerDisplay(worker: Pick<OperatorCockpitWorkerFleet, "role" | "workerId">) {
  const personaKey = normalizeOperatorWorkerPersonaKey(worker.workerId, worker.role);
  const koreanRoleLabel = operatorKoreanRoleLabelByRole[worker.role];
  const detailLabel = operatorPersonaRoleOverrideByKey[personaKey] ?? "기본 역할";

  return {
    displayName: operatorPersonaNameByKey[personaKey] ?? worker.workerId,
    portraitAgentId: personaKey,
    roleLabel: `${koreanRoleLabel} · ${detailLabel}`,
  };
}
