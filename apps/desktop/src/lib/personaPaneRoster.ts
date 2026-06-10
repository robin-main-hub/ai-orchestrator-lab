import type { AgentRole, TmuxPaneRole } from "@ai-orchestrator/protocol";
import { AGENT_ROLE_TO_PANE_ROLE } from "./personaAgentSet";
import { PERSONA_CODEX, type CodexEntry } from "./personaCodex";

/**
 * 캐릭터 ↔ tmux pane 배치표. 도감의 각 캐릭터를 선언된 에이전트 역할의
 * pane 워크스테이션으로 묶는다 (AGENT_ROLE_TO_PANE_ROLE 기준). 매칭되는
 * pane이 없는 캐릭터(협상/리스크/중재/외부 등)는 의도적으로 그대로 둔다 —
 * 사용자가 나중에 직접 배치를 정한다.
 */

export function codexByPaneRole(): Partial<Record<TmuxPaneRole, CodexEntry[]>> {
  const byPane: Partial<Record<TmuxPaneRole, CodexEntry[]>> = {};
  for (const entry of PERSONA_CODEX) {
    const paneRole = AGENT_ROLE_TO_PANE_ROLE[entry.role as AgentRole];
    if (!paneRole) continue;
    (byPane[paneRole] ??= []).push(entry);
  }
  return byPane;
}

/** 캐릭터들 중 아직 pane 매칭이 없는 명단 (사용자가 천천히 배치 예정) */
export function unmatchedCodex(): CodexEntry[] {
  return PERSONA_CODEX.filter((entry) => !AGENT_ROLE_TO_PANE_ROLE[entry.role as AgentRole]);
}
