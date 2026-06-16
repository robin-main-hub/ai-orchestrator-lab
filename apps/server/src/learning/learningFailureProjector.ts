import {
  buildLearningRuntimeManifest,
  deriveLearningFailureEvent,
  deriveLearningLoopState,
  type EventEnvelope,
  type LearningFailureEvent,
  type LearningLoopRecord,
  type LearningRuntimeManifest,
  type LearningRuntimeManifestInput,
  type SandboxErrorCard,
  type VerificationReport,
} from "@ai-orchestrator/protocol";

/**
 * LINE E — Server-side learning failure projector (PURE helpers, no auto-run).
 *
 * 서버/오케스트레이터 경계에서 "이미 머지된" learning loop contract(C1/C3)를 소비하기만
 * 하는 순수 헬퍼 모음이다. 여기서는:
 *   - EventStorage에 자동으로 append 하지 않는다(호출자가 명시적으로 한다).
 *   - background job / runtime skill load / agent spawn / DB migration 0.
 *   - 외부 전송 0, trusted/active 자동 승격 0.
 *
 * 즉, "무엇을 append할지"·"이벤트에서 무엇이 파생되는지"·"매니페스트 미리보기"만
 * 결정론적으로 계산한다. 실제 emit/load는 server route의 명시적 책임으로 남긴다
 * (이번 라인에서는 의도적으로 미연결 — PR body 참고).
 *
 * 불변선:
 *   - observed 실패 → 이벤트 / UNOBSERVED → 이벤트 없음(C1이 강제, 여기선 위임만).
 *   - writer 부재가 가짜 성공을 만들지 않는다(append는 호출자 책임, 헬퍼는 null만 반환).
 *   - 이벤트 replay가 동일 learning loop를 파생한다(deriveLearningLoopState 위임).
 */

/**
 * mission 실패 산출물(VerificationReport / SandboxErrorCard)에서 learning.failure
 * 이벤트를 계산한다. C1 deriveLearningFailureEvent를 그대로 위임 — evidence-gated,
 * observed-only. 근거가 없거나 unobserved면 null(emit 안 함).
 *
 * 이 함수는 어떤 append도 하지 않는다. 반환된 event를 EventStorage에 넣을지는
 * 호출자(server route)가 결정한다.
 */
export function learningFailureEventFromArtifacts(input: {
  verification?: Pick<VerificationReport, "id" | "missionId" | "status" | "observed" | "globalRevisionDirective">;
  errorCard?: Pick<SandboxErrorCard, "id" | "missionId" | "status" | "rootCause" | "truthStatus">;
  now: () => string;
}): LearningFailureEvent | null {
  return deriveLearningFailureEvent(input);
}

/**
 * learning.failure 이벤트를 EventStorage append 가능한 EventEnvelope로 포장한다.
 * 결정론적 id(failure.id 기반) — 같은 실패는 같은 envelope id를 만들어 storage의
 * idempotency/dedup가 자연스럽게 동작하게 한다. 부수효과 0(순수 매핑).
 *
 * 주의: 이 함수는 envelope를 "만들"뿐 append 하지 않는다.
 */
export function learningFailureEnvelope(event: LearningFailureEvent, now: () => string): EventEnvelope {
  const failure = event.payload.failure;
  return {
    id: `event_${event.type.replaceAll(".", "_")}_${failure.id}`,
    sessionId: failure.missionId,
    type: event.type,
    payload: event.payload,
    createdAt: now(),
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
  };
}

/**
 * 산출물 → (옵션) append 가능한 envelope. 근거 미달/unobserved면 null.
 * 편의 헬퍼: 위 두 함수를 합쳐 server route가 "넣을 게 있으면 이 envelope를 넣어라"
 * 식으로 쓸 수 있게 한다. 여전히 append는 하지 않는다.
 */
export function learningFailureEnvelopeFromArtifacts(input: {
  verification?: Pick<VerificationReport, "id" | "missionId" | "status" | "observed" | "globalRevisionDirective">;
  errorCard?: Pick<SandboxErrorCard, "id" | "missionId" | "status" | "rootCause" | "truthStatus">;
  now: () => string;
}): EventEnvelope | null {
  const event = learningFailureEventFromArtifacts(input);
  if (!event) return null;
  return learningFailureEnvelope(event, input.now);
}

/**
 * EventStorage 이벤트 스트림 → loopId별 LearningLoopRecord[].
 * deriveLearningLoopState(C 레이어)에 위임 — EventEnvelope는 {type,payload}를 가지므로
 * 그대로 LoopEvent로 받아들여진다. 순수 read-only 파생(저장소 변경 0).
 *
 * replay 안정성: 같은 이벤트 시퀀스는 같은 learning loop를 만든다(테스트로 보장).
 */
export function projectLearningLoopsFromEvents(
  events: ReadonlyArray<EventEnvelope>,
): LearningLoopRecord[] {
  return deriveLearningLoopState(events);
}

/**
 * skill runtime activation manifest 미리보기 — C3 buildLearningRuntimeManifest 위임.
 *
 * 중요(불변선): 이것은 PREVIEW다. 실제 runtime skill을 load하지 않고, agent를 spawn하지
 * 않으며, MemoryRecord.activationState를 바꾸지 않는다. eval-gated loadable/blocked
 * 데이터만 결정론적으로 돌려준다(가짜 pass 0).
 */
export function previewLearningRuntimeManifest(
  input: LearningRuntimeManifestInput,
): LearningRuntimeManifest {
  return buildLearningRuntimeManifest(input);
}
