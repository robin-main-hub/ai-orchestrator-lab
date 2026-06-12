/**
 * TTS 배선 설정 헬퍼 (P2-9, KIMI 브리프 / 서브컬처 축).
 *
 * 데스크톱이 캐릭터 음성을 합성하려면 (1) Kokoro 서버 주소와 (2) 페르소나 역할
 * → 음색 프리셋 매핑이 필요하다. 둘 다 순수 함수로 빼서 단위 테스트한다.
 *
 * Kokoro-FastAPI는 오케스트레이터 서버와 같은 dgx 호스트의 별도 포트(8880)에
 * 떠 있으므로, serverBaseUrl의 호스트만 재사용하고 포트를 8880으로 바꾼다.
 */

import type { TmuxPaneRole } from "@ai-orchestrator/protocol";

/** Kokoro-FastAPI 기본 포트 */
export const KOKORO_DEFAULT_PORT = 8880;
/** serverBaseUrl을 못 구할 때의 기본 Kokoro 주소 */
export const KOKORO_DEFAULT_BASE_URL = `http://dgx-02:${KOKORO_DEFAULT_PORT}`;

/**
 * 오케스트레이터 serverBaseUrl(문자열 또는 배열)에서 Kokoro 서버 주소를 유도한다.
 * 같은 호스트의 8880 포트를 쓴다. 파싱 실패 시 KOKORO_DEFAULT_BASE_URL.
 */
export function deriveKokoroBaseUrl(
  serverBaseUrl?: string | ReadonlyArray<string>,
  port: number = KOKORO_DEFAULT_PORT,
): string {
  const first = Array.isArray(serverBaseUrl) ? serverBaseUrl[0] : serverBaseUrl;
  if (!first || typeof first !== "string") return `http://dgx-02:${port}`;
  // http(s) URL이면 호스트/스킴을 그대로 재사용. 그 외(스킴 없는 "host:port" 등)는
  // 수동 추출 — new URL("dgx-02:7070")은 "dgx-02:"를 스킴으로 잘못 파싱하므로 신뢰 불가.
  if (/^https?:\/\//i.test(first)) {
    try {
      const url = new URL(first);
      if (url.hostname) return `${url.protocol}//${url.hostname}:${port}`;
    } catch {
      /* 폴백으로 진행 */
    }
  }
  const host = first.replace(/^[a-z]+:\/\//i, "").split("/")[0]?.split(":")[0];
  return host ? `http://${host}:${port}` : `http://dgx-02:${port}`;
}

/**
 * 페르소나 역할 → 음색 프리셋(VOICE_PRESET_DEFAULTS 키). 설계/검토/실행 역할은
 * 전용 프리셋, 조율자는 단호한(direct) 톤, 나머지는 차분한(calm) 기본.
 */
export function voicePresetForRole(role?: TmuxPaneRole | string): string {
  switch (role) {
    case "architect":
      return "architect";
    case "qa":
      return "reviewer"; // 검토 역할
    case "code":
    case "backend":
    case "frontend":
      return "executor";
    case "orchestrator":
    case "discussion":
      return "direct";
    default:
      return "calm";
  }
}
