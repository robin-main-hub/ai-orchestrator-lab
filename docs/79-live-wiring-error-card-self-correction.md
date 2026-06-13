# 79 — Live Wiring L4+L5: Error Card 자동 emit + Bounded Self-Correction

Error card 파서(PR5)와 self-correction 정책(PR5)은 만들어졌지만 검증 실패에 **반응**하지
않았다. L4+L5는 한 반응 경로로 묶는다(자가교정은 에러 카드에 반응하므로 같은 함수).

```
verify failed/blocked → parseSandboxError → mission.error_card.recorded
                      → decideSelfCorrection → mission.self_correction.{suggested|stopped}
passed → 아무것도 안 함 (루프 자동 reset)
```

## 한 일 (L4 — Error Card)

- **순환 끊기**: `truthStatusSchema`를 `truthStatus.ts`로 분리. productKernel이
  sandboxErrorCard/selfCorrection를 import해야 하는데(record 필드) 그 모듈들이 거꾸로
  truthStatus만 필요로 해서 순환이었다. 작은 기반 모듈로 양쪽이 import → 순환 해소
  (productKernel은 하위호환 re-export).
- **protocol**: `mission.error_card.recorded` payload(`missionErrorCardRecordedPayloadSchema`)
  + `ServerMissionRecord.errorCards`. 서버 전용 이벤트(클라이언트 append 창구에 없음).
- **store**: verify에서 report가 failed/blocked면 실패/skip check의 summary를 stderr로 모아
  `parseSandboxError`(결정적 TS/Py/Node 파서)로 카드 생성 → append. truthStatus는 report가
  observed면 observed, blocked(미실행)면 configured. **passed면 카드 없음.**

## 한 일 (L5 — Bounded Self-Correction)

- **protocol**: `missionSelfCorrectionRecordSchema`(제안/중단 기록) +
  `ServerMissionRecord.selfCorrections`. 이벤트 `mission.self_correction.suggested`(retry) /
  `mission.self_correction.stopped`(중단/사람검토).
- **store**: 에러 카드 직후 `decideSelfCorrection`(maxAttempts=3, 같은에러중단,
  allowedRoles)로 결정. **reset-on-pass**: 마지막 observed pass 이후의 에러 카드만 prior로
  센다 → 통과하면 카운터 리셋. **파일 변경 절대 없음 — 제안 이벤트만.**
- **trace**: 두 이벤트 모두 `traceEventFromMissionEnvelope`/`deriveMissionTrace`에 매핑 →
  Kanban/Trace/SSE에 정직하게 표시(에러는 error, 제안은 info, 중단은 warning).

## 정직성/안전 불변식 (테스트로 못박음)

- rootCause는 결정적 파서 결과만(AI 요약 없음) — 가짜 root cause 없음.
- 에러 카드/trace preview는 redacted(raw secret/full log 금지).
- **무한루프 금지**: 같은 에러 반복 → stop_same_error, maxAttempts 초과 → require_human.
- **자동 파일 수정 금지**: suggestion/stopped 이벤트만, mutation 0(테스트로 artifacts 0 확인).
- passed verification → 에러카드/제안 0 + 루프 reset(테스트로 attempt=1 복귀 확인).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| TS/Python/Node error 파싱 | ✅ parseSandboxError(결정적) |
| failed verify → error card | ✅ + trace 연결 |
| passed verify → 카드 없음 | ✅ |
| first failure → correction suggested | ✅ retry, attempt 1 |
| second same error → stopped/human | ✅ stop_same_error |
| attempts>3 → human review | ✅ decideSelfCorrection require_human |
| passed → loop reset | ✅ reset-on-pass |
| no file mutation | ✅ 제안 이벤트만 |

## 검증

protocol 68 · server 216(+4) · desktop 1141 그린, 전 패키지 typecheck 그린. docs/79.
