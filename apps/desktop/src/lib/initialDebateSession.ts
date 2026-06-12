import type { Stage3DebateSession } from "../runtime/stage3Runtime";

/**
 * 앱이 처음 보여줄 토론 상태를 고른다: 실제 엔진으로 캡처한 라이브 샘플이
 * 쓸 만하면(라이브 + 실제 발언 존재) 그걸 쓰고, 아니면 템플릿 폴백으로
 * 돌아간다. 샘플 캡처가 깨져도 앱이 빈 토론으로 시작하지 않게 하는 가드.
 */
export function resolveInitialDebateSession(input: {
  sample?: Stage3DebateSession;
  fallback: () => Stage3DebateSession;
}): Stage3DebateSession {
  const sample = input.sample;
  if (
    sample &&
    sample.runState === "live" &&
    sample.rounds.length > 0 &&
    sample.rounds.some((round) => round.utterances.length > 0)
  ) {
    return sample;
  }

  return input.fallback();
}
