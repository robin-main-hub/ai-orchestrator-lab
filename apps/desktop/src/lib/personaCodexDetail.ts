import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import type { AgentProfile, AgentRole, TmuxPaneRole } from "@ai-orchestrator/protocol";
import type { HermesSlot } from "./hermesSlotPool";
import { AGENT_ROLE_TO_PANE_ROLE } from "./personaAgentSet";
import type { CodexEntry } from "./personaCodex";

/**
 * 도감 카드 클릭 → 캐릭터 상세 화면에 들어가는 모든 데이터를 한 번에 해석.
 * 영혼 발췌(SOUL.md 도입부), 선언 권한, 배치 워크스테이션, 스티키 Hermes 슬롯
 * 바인딩까지 — 전부 이미 존재하는 소스에서 읽는 순수 조립.
 */

export type CodexDetail = {
  entry: CodexEntry;
  /** SOUL.md 도입부 발췌 (헤더 제외, ~누적 limit자) */
  soulExcerpt: string;
  /** 선언 프로필 (있을 때) */
  permissionLevel?: string;
  enabled?: boolean;
  /** 매칭된 tmux 워크스테이션 (없으면 미배치) */
  paneRole?: TmuxPaneRole;
  /** 스티키 Hermes 슬롯 바인딩 */
  slotId?: string;
};

export function soulExcerptFromBundle(
  bundleMap: Record<string, string>,
  personaName: string,
  limit = 420,
): string {
  const raw = bundleMap[`agents/${personaName}/SOUL.md`];
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#") && line.trim().length > 0);
  let excerpt = "";
  for (const line of lines) {
    if (excerpt.length >= limit) break;
    excerpt += (excerpt ? "\n" : "") + line.trim();
  }
  return excerpt.slice(0, limit);
}

export function buildCodexDetail(
  entry: CodexEntry,
  deps: {
    bundleMap: Record<string, string>;
    slots: ReadonlyArray<HermesSlot>;
    profiles?: ReadonlyArray<AgentProfile>;
  },
): CodexDetail {
  const profiles = deps.profiles ?? defaultAgentProfiles;
  const profile = profiles.find(
    (candidate) => candidate.personaName === entry.personaName || candidate.role === entry.role,
  );
  const slot = deps.slots.find((candidate) => candidate.status === "bound" && candidate.persona === entry.personaName);
  return {
    entry,
    soulExcerpt: soulExcerptFromBundle(deps.bundleMap, entry.personaName),
    permissionLevel: profile?.permissionLevel,
    enabled: profile?.enabled,
    paneRole: AGENT_ROLE_TO_PANE_ROLE[entry.role as AgentRole],
    slotId: slot?.id,
  };
}
