import type { PermissionActor } from "@ai-orchestrator/protocol";
import { agentKoreanNameByIdentity } from "./agentDisplay";
import { resolvePersonaPortraitUrl } from "./personaPortrait";

/**
 * 페르소나 신원 리졸버 — 대화·승인·레일 등 여러 surface 가 같은 규칙으로 이름/이니셜/
 * 초상화/역할 슬러그를 뽑도록 통일한다. 기존 모듈(agentDisplay·personaPortrait)을
 * 조합하며 로직을 복제하지 않는다. 신원을 모르면 정직하게 actor 라벨 → "시스템" 으로
 * 폴백한다(가짜 페르소나를 만들지 않음).
 */

/** actor enum → 정직한 한국어 폴백 라벨(페르소나 신원을 모를 때). */
export function actorLabel(actor: PermissionActor): string {
  switch (actor) {
    case "user":
      return "운영자";
    case "agent":
      return "에이전트";
    case "external_channel":
      return "외부 채널";
    case "mobile":
      return "모바일";
    case "server":
      return "서버";
    default:
      return "에이전트";
  }
}

/** 표시 이름 결정 — 신원 있으면 그 이름, 없으면 actor enum 라벨(정직 폴백). */
export function resolveRequesterName(requester: { name?: string; actor: PermissionActor }): string {
  return requester.name?.trim() || actorLabel(requester.actor);
}

/** 이름의 첫 글자(코드포인트) 이니셜 — 폴백 라벨/시스템 이름용. */
export function resolveIdentityInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

/**
 * 역할 문자열 → 페르소나 정본 슬러그. workbenchMissions(:69) 가 만드는
 * "qa-verifier" 같은 슬러그가 페르소나 키(verifier)와 어긋나는 걸 바로잡는다.
 * 비영숫자 구분자는 `_` 로 접어(collapse) 관용 처리한다.
 */
const ROLE_SLUG_ALIASES: Record<string, string> = {
  implementer: "builder",
  qa_verifier: "verifier",
};

export function normalizePersonaRoleSlug(role?: string): string | undefined {
  if (role == null) return undefined;
  const collapsed = role
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (collapsed === "") return undefined;
  // 이미 정본인 키(architect, verifier, memory_curator …)는 collapse 후 그대로 통과한다.
  return ROLE_SLUG_ALIASES[collapsed] ?? collapsed;
}

export interface PersonaIdentityInput {
  personaName?: string;
  role?: string;
  name?: string;
  actor?: PermissionActor;
}

export interface ResolvedPersonaIdentity {
  displayName: string;
  initials: string;
  portraitUrl?: string;
  roleSlug?: string;
  isFallback: boolean;
}

/** agentDisplay.agentInitialsForDisplay 와 동일한 규칙(한/영 글자만, 2글자, 대문자, 폴백 AI). */
function koreanStyleInitials(displayName: string): string {
  return displayName.replace(/[^A-Za-z가-힣]/g, "").slice(0, 2).toUpperCase() || "AI";
}

export function resolvePersonaIdentity(input: PersonaIdentityInput): ResolvedPersonaIdentity {
  const roleSlug = normalizePersonaRoleSlug(input.role);
  const identityKey = input.personaName ?? roleSlug;
  const koreanName = identityKey ? agentKoreanNameByIdentity[identityKey] : undefined;
  const trimmedName = input.name?.trim() || undefined;

  let displayName: string;
  let isFallback: boolean;
  if (koreanName) {
    displayName = koreanName;
    isFallback = false;
  } else if (trimmedName) {
    displayName = trimmedName;
    isFallback = false;
  } else if (input.actor) {
    displayName = actorLabel(input.actor);
    isFallback = true;
  } else {
    displayName = "시스템";
    isFallback = true;
  }

  return {
    displayName,
    initials: isFallback ? resolveIdentityInitial(displayName) : koreanStyleInitials(displayName),
    portraitUrl: resolvePersonaPortraitUrl(input.personaName, roleSlug),
    roleSlug,
    isFallback,
  };
}
