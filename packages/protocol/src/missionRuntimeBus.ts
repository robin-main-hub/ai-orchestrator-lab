import type { MissionTraceEvent, MissionTraceEventType, MissionTraceSeverity } from "./missionBoard.js";
import type { TruthStatus } from "./productKernel.js";

/**
 * Mission Runtime Bus — mission.* 이벤트가 EventStorage에 append될 때마다 흐르는
 * 경량 관측 알림. 풀 trace(제목/요약/preview)는 GET /missions/:id/trace 와
 * /trace/stream 이 전달하고, 이 타입은 순서/심각도/truthStatus만 들고 다니는
 * 압축 투영이다. EventStorage가 단일 진실 — 별도 저장소를 만들지 않는다.
 */
export type MissionRuntimeBusEvent = {
  missionId: string;
  traceEventId: string;
  eventType: MissionTraceEventType;
  severity: MissionTraceSeverity;
  truthStatus: TruthStatus;
  createdAt: string;
};

/** 풀 trace 이벤트 → 압축 bus 이벤트. preview/secret은 절대 싣지 않는다. */
export function toMissionRuntimeBusEvent(event: MissionTraceEvent): MissionRuntimeBusEvent {
  return {
    missionId: event.missionId,
    traceEventId: event.id,
    eventType: event.type,
    severity: event.severity,
    truthStatus: event.truthStatus,
    createdAt: event.createdAt,
  };
}
