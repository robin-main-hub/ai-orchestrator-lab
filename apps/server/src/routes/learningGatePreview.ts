import type { IncomingMessage } from "node:http";
import {
  DEFAULT_LEARNING_FAILURE_GATE_CONFIG,
  shouldAppendLearningFailure,
  type LearningFailureGateConfig,
  type LearningFailureGateDecision,
} from "../learning/learningFailureGate.js";

/**
 * LINE L — learning.failure GATE를 "읽기 전용 / 기본 비활성" HTTP route로 노출한다.
 *
 * 매우 중요(불변선 — 이 route는 절대 다음을 하지 않는다):
 *   - 이벤트 append 0 / 상태 변이 0 / background job 0 / 외부 send 0 / DB migration 0.
 *   - 이 route는 EventStorage 의존성을 받지 않는다(주입 자체가 없으므로 변이 불가능).
 *   - 오직 shouldAppendLearningFailure(순수 함수)를 호출해 "이 가상의 실패를
 *     append 한다면 게이트가 무엇을 결정할까?"를 미리보기로 반환할 뿐이다.
 *
 * 기본값: gate.enabled=false → 어떤 입력에도 append:false, reason "gate_disabled".
 *   - enabled는 실제 enablement에 wiring되어 있지 않다. 미리보기 목적의 ?enabled=true
 *     쿼리만 게이트의 enabled 플래그에 전달되며, 그래도 이 route는 append하지 않는다.
 *   - 실제 켜기 경로는 owner의 명시적 설정 주입이다(docs/SERVER_LEARNING_FAILURE_GATE.md).
 */

const ROUTE_PATH = "/learning/failure-gate/preview";

/** 게이트의 internal reason → 미리보기 응답에 노출할 안정적 reason 코드. */
function previewReason(decision: LearningFailureGateDecision): string {
  if (decision.reason === "disabled") return "gate_disabled";
  return decision.reason;
}

export type LearningGatePreviewRouteDependencies = {
  request: IncomingMessage;
  pathname: string;
  method?: string;
  /** request.url의 searchParams — index.ts에서 이미 파싱된 URL을 넘긴다. */
  searchParams: URLSearchParams;
  respondJson: (statusCode: number, payload: unknown) => void;
  /**
   * 결정론적 시각 주입(Date.now 금지). 파생 이벤트의 createdAt에만 쓰인다.
   * 미제공이면 고정 epoch을 쓴다 — 미리보기는 시각에 의존하지 않게.
   */
  now?: () => string;
};

/**
 * GET /learning/failure-gate/preview
 *
 * 쿼리:
 *   - missionId            (필수: 둘 중 하나의 anchor가 있을 때 의미)
 *   - verificationReportId (옵션) — verification anchor
 *   - sandboxErrorCardId   (옵션) — sandbox anchor
 *   - observed             (옵션, "true"/"false") — verification.observed (근거 게이팅)
 *   - enabled              (옵션, "true") — 미리보기용 게이트 enabled 플래그
 *
 * 응답(200): {
 *   append: boolean, reason: string, idempotencyKey?: string,
 *   gateEnabled: boolean, sideEffectsPerformed: false, preview: true
 * }
 *
 * 이 핸들러는 부수효과가 0이며 항상 200으로 "결정 미리보기"만 돌려준다.
 */
export async function handleLearningGatePreviewRoute({
  pathname,
  method,
  searchParams,
  respondJson,
  now,
}: LearningGatePreviewRouteDependencies): Promise<boolean> {
  if (pathname !== ROUTE_PATH || method !== "GET") {
    return false;
  }

  const missionId = searchParams.get("missionId") ?? undefined;
  const verificationReportId = searchParams.get("verificationReportId") ?? undefined;
  const sandboxErrorCardId = searchParams.get("sandboxErrorCardId") ?? undefined;
  const observedParam = searchParams.get("observed");
  const enabledParam = searchParams.get("enabled");

  // 미리보기 전용 config. enabled는 실제 enablement에 wiring되어 있지 않다.
  // ?enabled=true는 "켜져 있다면 게이트가 무엇을 결정할까"를 보여주기 위함일 뿐,
  // 이 route는 그래도 append하지 않는다.
  const config: LearningFailureGateConfig =
    enabledParam === "true"
      ? { enabled: true }
      : DEFAULT_LEARNING_FAILURE_GATE_CONFIG;

  // verification anchor가 있을 때만 verification 입력을 구성한다.
  const verification =
    verificationReportId && missionId
      ? {
          id: verificationReportId,
          missionId,
          status: "failed" as const,
          observed: observedParam === "true",
          ...(searchParams.get("globalRevisionDirective")
            ? { globalRevisionDirective: searchParams.get("globalRevisionDirective") ?? undefined }
            : {}),
        }
      : undefined;

  const errorCard =
    sandboxErrorCardId && missionId
      ? {
          id: sandboxErrorCardId,
          missionId,
          status: "failed" as const,
          rootCause: searchParams.get("rootCause") ?? "preview",
          truthStatus: (observedParam === "true" ? "observed" : "simulated") as
            | "observed"
            | "simulated",
        }
      : undefined;

  const decision = shouldAppendLearningFailure({
    config,
    verification,
    errorCard,
    // seen 미제공 → "본 적 없음". 이 route는 dedup 저장소를 스캔하지 않는다(부수효과 0).
    now: now ?? (() => "1970-01-01T00:00:00.000Z"),
  });

  respondJson(200, {
    preview: true,
    sideEffectsPerformed: false,
    gateEnabled: config.enabled,
    append: decision.append,
    reason: previewReason(decision),
    ...(decision.idempotencyKey ? { idempotencyKey: decision.idempotencyKey } : {}),
  });
  return true;
}
