import type { WorkbenchAgent } from "../types";
import { agentRoleLabel } from "./helpers";

export const agentKoreanNameByIdentity: Record<string, string> = {
  architect: "오시노 시노부",
  auditor: "카스가노 소라",
  builder: "히라사와 유이",
  kurumi: "쿠루미",
  companion: "쿠루미",
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

export const agentDisplayRoleLabelByIdentity: Record<string, string> = {
  skeptic: "UX 비판자",
  yohane: "4차원 아이디어 뱅크",
};

export function agentIdentityKey(agent: Pick<WorkbenchAgent, "personaName" | "role">) {
  return agent.personaName ?? agent.role;
}

export function agentPrimaryDisplayName(agent: Pick<WorkbenchAgent, "name" | "personaName" | "role">) {
  return agentKoreanNameByIdentity[agentIdentityKey(agent)] ?? agent.name;
}

export function agentSecondaryDisplayLabel(agent: Pick<WorkbenchAgent, "personaName" | "role">) {
  const identityKey = agentIdentityKey(agent);
  const detailLabel = agentDisplayRoleLabelByIdentity[identityKey] ?? "기본 역할";
  return `${agentRoleLabel(agent.role)} · ${detailLabel}`;
}

export function agentInitialsForDisplay(agent: Pick<WorkbenchAgent, "name" | "personaName" | "role">) {
  return agentPrimaryDisplayName(agent)
    .replace(/[^A-Za-z가-힣]/g, "")
    .slice(0, 2)
    .toUpperCase() || "AI";
}
