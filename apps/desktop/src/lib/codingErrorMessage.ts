/**
 * 코딩 워크벤치 오류 메시지를 운영자가 바로 행동할 수 있게 다듬는다. LLM 호출은
 * 오케스트레이터 서버(:4317)의 /provider-completions(/stream)로 가므로, "Failed to
 * fetch" 류 네트워크 실패는 프로바이더가 아니라 그 서버에 못 닿은 것 — 그렇게 설명한다.
 *
 * 순수 함수 — 단위 테스트된다.
 */

const NETWORK_RE = /Failed to fetch|fetch failed|NetworkError|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i;

export function humanizeCodingError(raw: string | undefined): string {
  if (!raw) return "";
  if (NETWORK_RE.test(raw)) {
    return "오케스트레이터 서버(:4317)에 연결할 수 없습니다 — 서버 실행·Tailscale 연결을 확인하세요.";
  }
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}
