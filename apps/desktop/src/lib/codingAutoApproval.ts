import type { AutonomyMode } from "./autonomousRun";
import { extractCommandPrefix } from "./sessionPatternApproval";
import { DANGEROUS_PATTERN } from "./safeCommandPolicy";

/**
 * 코딩 워크벤치의 등급형 자동승인 — 바이브 코딩에 필수이지만 무제한 자동승인이 아니다.
 *
 * 4단계 모드 (Codex의 suggest/auto-edit/full-auto · Claude Code의 ask/acceptEdits/bypass 대응):
 *   - manual       : 모든 명령 사람 승인(기본)
 *   - auto_safe    : safeCommandPolicy allowlist 통과 명령만 자동
 *   - session_allow: 사용자가 "이 계열 허용"한 prefix만 자동 (세션 한정)
 *   - guided_auto  : DANGEROUS_PATTERN 제외 자동 — 가장 위험. 명시적 opt-in + 경고 확인 필요
 *
 * 어떤 모드든 다음은 항상 사람 승인:
 *   - DANGEROUS_PATTERN(rm·sudo·git push·force·shell 메타문자 등)
 *   - commandPreview가 없는 항목(B/C의 정직성 원칙)
 *   - GitHub write·merge·rollback·secret_access(상위 레이어가 차단)
 *
 * 안전선:
 *   - 기본 모드는 guided_auto(완전 자동, full-auto 후속). 저장된 명시 값이 있으면 그대로 존중한다.
 *     위험 명령(DANGEROUS_PATTERN)은 어떤 모드에서도 자동 승인되지 않는다 — 기본이 자동이어도 안전선은 유지.
 *   - 자동승인을 처음 켤 때 위험 경고를 보여주고, 사용자가 확인해야만 활성화.
 *   - "이번 세션 동안" prefix는 세션 한정. project/global 영구 저장은 이번 범위 아님.
 *   - 자동 그랜트는 서버 /approvals/grant 엔드포인트를 통과해 감사 흔적을 남긴다.
 */

export type CodingApprovalMode = "manual" | "auto_safe" | "session_allow" | "guided_auto";

/**
 * 저장된 값이 없을 때의 기본 모드 — full-auto 후속으로 guided_auto(위험 제외 자동).
 * 명시적으로 저장된 값은 항상 존중한다(아래 parseStoredApprovalMode 참고).
 */
export const DEFAULT_CODING_APPROVAL_MODE: CodingApprovalMode = "guided_auto";

export const CODING_APPROVAL_MODE_STORAGE_KEY = "ai-orchestrator.coding-approval-mode.v2";
export const CODING_APPROVED_PREFIXES_STORAGE_KEY = "ai-orchestrator.coding-approved-prefixes.v2";
/** 위험 경고를 본 후 확인한 시각(ISO). 없으면 아직 자동승인을 켠 적이 없는 사용자. */
export const CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY = "ai-orchestrator.coding-auto-approval-armed.v1";

export type CodingApprovalModeMeta = {
  id: CodingApprovalMode;
  label: string;
  hint: string;
  /** true면 사용자가 처음 켤 때 위험 경고 확인을 받아야 한다. */
  requiresArmConfirmation: boolean;
};

export const CODING_APPROVAL_MODES: ReadonlyArray<CodingApprovalModeMeta> = [
  { id: "manual", label: "사람 승인", hint: "모든 명령을 직접 승인", requiresArmConfirmation: false },
  { id: "auto_safe", label: "안전 검증 자동", hint: "읽기·검증 등 안전 명령만 자동 승인", requiresArmConfirmation: true },
  { id: "session_allow", label: "세션 계열 허용", hint: '명시 허용한 계열(예: "pnpm test")을 이번 세션 동안 자동', requiresArmConfirmation: true },
  { id: "guided_auto", label: "자동 진행", hint: "위험 명령(rm·push·sudo 등)만 빼고 자동 (기본)", requiresArmConfirmation: true },
];

/** 처음 자동승인을 켤 때 보여줄 경고 — 사용자가 확인하면 일회성으로 armed로 기억된다. */
export const CODING_AUTO_APPROVAL_WARNING = [
  "자동승인을 켜면 일부 명령이 사람 확인 없이 실행됩니다.",
  "위험 명령(rm·git push·sudo·shell 메타문자 등)은 어떤 모드에서도 자동 승인되지 않지만, 안전해 보이는 명령도 실수로 작업물을 바꿀 수 있습니다.",
  "정말로 자동승인을 활성화하시겠어요?",
].join("\n");

export function isCodingApprovalMode(value: unknown): value is CodingApprovalMode {
  return value === "manual" || value === "auto_safe" || value === "session_allow" || value === "guided_auto";
}

export function parseStoredApprovalMode(raw: string | null | undefined): CodingApprovalMode {
  // 명시 저장 값은 존중, 없거나(=null) 잘못된 값은 기본(guided_auto)으로.
  return isCodingApprovalMode(raw) ? raw : DEFAULT_CODING_APPROVAL_MODE;
}

export function isAutoMode(mode: CodingApprovalMode): boolean {
  return mode !== "manual";
}

/** 사용자가 처음 자동승인을 켤 때 경고 확인이 필요한지 — 이미 armed면 false. */
export function shouldShowAutoApprovalWarning(targetMode: CodingApprovalMode, armedAt: string | null): boolean {
  if (!isAutoMode(targetMode)) return false;
  return !armedAt;
}

/**
 * UI 모드 → createApprovalStrategy 설정. session_allow는 기억된 prefix만 자동(전체 자동 아님).
 * getApprovedPrefixes는 호출자가 별도로 전달한다(세션 한정 상태).
 */
export function codingApprovalConfig(mode: CodingApprovalMode): {
  autonomyMode: AutonomyMode;
  autoApproveAll: boolean;
  patternPrefixesEnabled: boolean;
} {
  switch (mode) {
    case "manual":
      return { autonomyMode: "human", autoApproveAll: false, patternPrefixesEnabled: false };
    case "auto_safe":
      return { autonomyMode: "auto_safe", autoApproveAll: false, patternPrefixesEnabled: false };
    case "session_allow":
      return { autonomyMode: "human", autoApproveAll: false, patternPrefixesEnabled: true };
    case "guided_auto":
      // guided_auto = safe 자동 + 기억된 계열 + 위험 제외 전체 자동
      return { autonomyMode: "auto_safe", autoApproveAll: true, patternPrefixesEnabled: true };
  }
}

/**
 * 명령에서 자동승인 계열(prefix)을 도출. 추가 가능한지도 함께 알려준다 — 위험 명령이면 불가.
 * 실제 commandPreview가 있을 때만 호출되어야 한다(summary/reason 문자열 금지).
 */
export function approvedPrefixCandidate(command: string): { prefix: string; canAdd: boolean; blockedReason?: string } {
  const trimmed = (command ?? "").trim();
  if (!trimmed) return { prefix: "", canAdd: false, blockedReason: "명령이 비어 있음" };
  if (DANGEROUS_PATTERN.test(trimmed)) return { prefix: extractCommandPrefix(trimmed), canAdd: false, blockedReason: "위험 명령은 계열 허용 대상 아님" };
  const prefix = extractCommandPrefix(trimmed);
  if (!prefix) return { prefix: "", canAdd: false, blockedReason: "계열을 추출하지 못함" };
  return { prefix, canAdd: true };
}

export function addApprovedPrefix(existing: ReadonlyArray<string>, command: string): string[] {
  const candidate = approvedPrefixCandidate(command);
  if (!candidate.canAdd) return [...existing];
  if (existing.includes(candidate.prefix)) return [...existing];
  return [...existing, candidate.prefix];
}

export function removeApprovedPrefix(existing: ReadonlyArray<string>, prefix: string): string[] {
  return existing.filter((entry) => entry !== prefix);
}

export function parseStoredApprovedPrefixes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).slice(0, 100);
  } catch {
    return [];
  }
}
