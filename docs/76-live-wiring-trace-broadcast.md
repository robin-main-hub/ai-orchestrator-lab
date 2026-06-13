# 76 — Live Wiring L1: Mission Runtime Bus / Trace Broadcast

엔진을 만드는 단계는 끝났다. 이제부터는 **dead engine 제거 = live wiring**이다.
L1은 그 첫 단계: mission.* 이벤트가 EventStorage에 커밋될 때마다 **실시간 관측
흐름**을 연다. UI 대수술 없이 서버 레벨에서 먼저 닫는다.

```
mission.* append → onEventsCommitted → MissionTraceBus.publish
                 → traceEventFromMissionEnvelope(순수·redacted)
                 → 그 미션을 구독 중인 SSE 세션에만 write
```

## 한 일

- **순수 매퍼 (protocol)**: `traceEventFromMissionEnvelope(envelope)` — 단일 mission.*
  봉투를 단일 `MissionTraceEvent`로 매핑한다. `deriveMissionTrace`(스냅샷)와 **같은
  per-component 빌더**(created/worker/verification/merge)를 공유하므로 스냅샷과 라이브
  스트림이 절대 어긋나지 않는다. payload는 신뢰하지 않고 스키마로 재검증, 매핑 대상이
  아니거나 깨진 payload는 null(무시). `mission.closed`는 trace 이벤트를 만들지 않는다.
- **압축 투영 (protocol)**: `MissionRuntimeBusEvent` + `toMissionRuntimeBusEvent` —
  순서/심각도/truthStatus만 들고 다니는 경량 알림(preview/secret 없음).
- **커밋 훅 (server store)**: `MissionStoreDeps.onEventsCommitted`. store 내부에 단일
  append 창구 `commit()`을 두고 create/append/verify/merge가 모두 이 경로를 지나게 했다
  → trace가 한 곳에서 일관되게 흐른다. 훅은 **관측 전용**(새 이벤트 append 금지, 루프
  방지), 실패해도 append는 이미 커밋됐으므로 삼키고 진행(broadcast best-effort).
- **per-mission 버스 (server)**: `MissionTraceBus` — `Map<missionId, Set<SseSession>>`.
  전역 broadcast가 아니라 **미션별 라우팅**: 한 미션의 trace가 다른 미션 스트림에 새지
  않는다. 종료 시 자동 unsubscribe.
- **SSE 라우트 (server)**: `GET /missions/:id/trace/stream` — 초기 스냅샷
  (`mission.trace.snapshot` = 현재 redacted trace) 후 `mission.trace` 증분 push.
  `GET /missions/:id/trace`(폴링)와 **같은 소스**(EventStorage 파생)를 쓴다.

## 정직성/보안 불변식

- **새 저장소 0** — EventStorage가 단일 진실, trace는 전부 파생.
- 전선에 싣는 건 `traceEventFromMissionEnvelope` 결과뿐 — raw command/full log/secret은
  실리지 않는다(`payloadPreview`는 `redactTracePreview` 통과값). 테스트로 `sk-...`
  토큰이 전선에 안 나오는 것을 못박았다.
- 검증 observed 정직성 유지: `observed:false`면 trace truthStatus는 `simulated`(위장 금지),
  머지는 real sha일 때만 `observed`.

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| mission created → trace 표시 | ✅ created 봉투 매핑 + 스냅샷 |
| verify completed → trace 표시 | ✅ verification.recorded 매핑 |
| merge completed/conflict/dry_run → 정직 표시 | ✅ mergeTraceEvent(observed/planned/configured) |
| stream ordering | ✅ append 순서대로 publish |
| secret redaction | ✅ payloadPreview redacted, 테스트로 못박음 |
| no new store | ✅ EventStorage 파생 |

## 검증

protocol 68(+5) · server 198(+6) 그린, server typecheck 그린. docs/76.

## Live Wiring 시리즈 (docs/76–)

L1 trace broadcast(이 문서) · L2 runner registry · L3 checkpoint hooks · L4 error card
emit · L5 self-correction suggestion · L6 skill candidate emit · L7 workflow template
mission API · L8 product E2E smoke.
