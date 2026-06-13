import { traceEventFromMissionEnvelope, type EventEnvelope } from "@ai-orchestrator/protocol";
import type { SseSession } from "../events/sseSession.js";

/**
 * MissionTraceBus — mission.* 이벤트가 EventStorage에 커밋될 때마다(L1) 해당 미션을
 * 구독 중인 SSE 세션에 redacted trace 이벤트를 push한다.
 *
 *   commit → onEventsCommitted → bus.publish(missionId, envelopes)
 *          → traceEventFromMissionEnvelope(순수, redacted) → session.writeEvent
 *
 * 정직성/보안:
 *   - 새 저장소 없음 — EventStorage가 단일 진실, 여기서는 파생만 한다.
 *   - 미션별로만 라우팅한다(전역 broadcast 아님): 한 미션의 trace가 다른 미션
 *     스트림에 새지 않는다.
 *   - 전선에 싣는 건 traceEventFromMissionEnvelope의 결과뿐 — raw command/log/secret은
 *     실리지 않는다(payloadPreview는 redactTracePreview를 통과한 값).
 *   - mission.closed처럼 trace 대상이 아닌 이벤트는 null이라 무시된다.
 */
export class MissionTraceBus {
  private readonly byMission = new Map<string, Set<SseSession>>();

  subscribe(missionId: string, session: SseSession): void {
    let set = this.byMission.get(missionId);
    if (!set) {
      set = new Set();
      this.byMission.set(missionId, set);
    }
    set.add(session);
  }

  unsubscribe(missionId: string, session: SseSession): void {
    const set = this.byMission.get(missionId);
    if (!set) return;
    set.delete(session);
    if (set.size === 0) this.byMission.delete(missionId);
  }

  publish(missionId: string, envelopes: ReadonlyArray<EventEnvelope>): void {
    const set = this.byMission.get(missionId);
    if (!set || set.size === 0) return;
    for (const envelope of envelopes) {
      const traceEvent = traceEventFromMissionEnvelope(envelope);
      if (!traceEvent) continue;
      for (const session of set) {
        session.writeEvent("mission.trace", traceEvent);
      }
    }
  }

  /** 한 미션을 구독 중인 스트림 수 (관측/테스트용). */
  subscriberCount(missionId: string): number {
    return this.byMission.get(missionId)?.size ?? 0;
  }

  get missionCount(): number {
    return this.byMission.size;
  }
}

export const missionTraceBus = new MissionTraceBus();
