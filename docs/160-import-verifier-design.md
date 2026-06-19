# A3 Legacy Import Verifier — Design (design only)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음.**
> **선행**: A0 `docs/157`, A1 `docs/158`(import 계획 + manifest 필드), A2 `docs/159`(AuthoritativeEventStore 계약).
> **목표**: A1 blueprint의 "일회성 멱등 import + manifest(count/hash 검증)"를 **결정론적 검증 알고리즘**으로 구체화한다. 기존 DGX JSONL(+SimpleMem export)을 MacBook `AuthoritativeEventStore`로 옮길 때, import 전후 동일성을 *어떻게* 증명하는지를 못 박는다. **검증 알고리즘 설계이지 import 실행/구현이 아니다.**

## 한 줄 요약
The legacy import verifier is now specified as a deterministic, idempotent parity check reusing the server's existing stable-stringify fingerprint.

## 실측: 재사용할 기존 primitive (정본)
import 검증은 *새 해시 규약을 발명하지 않고* 서버가 이미 쓰는 결정론적 직렬화를 재사용한다.
- **레코드 형태**: `ServerEventStorageRecord = { revision: number; storedAt: string; event: EventEnvelope }` (`apps/server/src/index.ts:827-831`). JSONL 한 줄 = 한 레코드.
- **결정론적 직렬화**: `fingerprintEvent(value) = stableStringify(value)` (`:7494-7496`). `stableStringify`(`:7498-7511`)는 객체 키를 `localeCompare`로 정렬·재귀 직렬화 → **키 순서·플랫폼 독립**. import parity의 canonical form으로 그대로 채택.
- **logical key**: `fingerprintLogicalEventContent(event)` (`:5822`) — 같은 논리 이벤트(같은 messageId 등) 판정. dedup parity에 사용.
- **파싱**: `parseEventStorageRecord(line)` (`:7320-7322`) — 손상 줄 무시(undefined 반환) 패턴. verifier도 동일하게 손상 줄을 `rejected`로 분류.

## 검증 대상 불변식 (무엇을 증명하나)
import이 **데이터 손실/변형/중복 없음**을 증명한다:
```text
I1 (no loss)        : 원본의 모든 유효 이벤트가 target에 존재(또는 명시적 rejected).
I2 (no mutation)    : import된 각 이벤트의 canonical fingerprint == 원본 fingerprint.
I3 (no dup)         : target에 같은 event.id 두 번 없음(멱등 append).
I4 (accounted)      : totalRecords == importedCount + duplicateCount + rejectedCount.
I5 (deterministic)  : verifierHash(target import set)가 재계산 시 동일.
I6 (idempotent)     : import 재실행 → 신규 0, 전부 duplicate, verifierHash 불변.
```

## verifier 알고리즘 (결정론적, 의사 설계)
```text
INPUT: legacy source = JSONL lines (+ optional SimpleMem export로 정규화된 EventEnvelope[])
       target = AuthoritativeEventStore (A2 계약: readAll/contains/head)

1. PARSE & CLASSIFY (source)
   for each line:
     rec = parseEventStorageRecord(line)
     rec 없음 → rejected++ (손상/비스키마), reason 기록
     rec 있음 → sourceEvents.push(normalize(rec.event)), keep rec.revision as legacyServerRevision
   normalize(event): A1 규칙 — legacyId=event.id, epoch=0(legacy), localSeq=정렬 순번 부여.
     정렬 키 = (event.createdAt, event.id) 사전식 → 결정론적 localSeq.

2. SOURCE CANONICAL SET
   sourceById = map(event.id → fingerprintEvent(event))   // I2 기준값
   sourceLogical = multiset(fingerprintLogicalEventContent(event))

3. IMPORT (멱등 — 실제 append는 Phase 2 코드; verifier는 dry-run parity도 가능)
   for each event in sourceEvents (localSeq 순):
     if target.contains(event.id):
        if fingerprintEvent(target.read(event.id)) == sourceById[event.id]: duplicate++   // I3,I6
        else: conflict++ (reason=same_id_different_payload)  // 예상 외 — GO 차단
     else: importedCount++ (append 예정/실행)

4. POST-IMPORT PARITY
   targetSet = target.readAll() 중 epoch==0(legacy) 부분
   I1: every sourceById.key ∈ targetSet.ids  OR  rejected에 기록됨
   I2: ∀ id: fingerprintEvent(targetSet[id]) == sourceById[id]
   I4: totalRecords == importedCount + duplicateCount + rejectedCount
   I5: verifierHash = sha256( join("\n", sort( targetSet.map(e => fingerprintEvent(e)) )) )

GO  : conflict==0 AND I1..I5 모두 성립 AND verifierHash == manifest.verifierHash(재계산 일치)
HOLD: 위 중 하나라도 실패 → ROLLBACK(원본 무변경, A1). manifest에 실패 불변식 기록.
```

## verifierHash 규약 (결정론 보장)
```text
perEvent  = fingerprintEvent(event)            // stableStringify (키 정렬)
ordered   = sort(perEvent_list)                // 사전식 — 입력 순서 무관
verifierHash = sha256(ordered.join("\n"))
성질: import 순서·플랫폼·해시 시점에 무관하게 동일 입력 set → 동일 해시(I5).
재실행(I6): 신규 append 0이면 targetSet 불변 → verifierHash 불변.
```
주의: `storedAt`/`revision`은 verifierHash에 **포함하지 않는다**(서버측 메타데이터로 노드마다 다를 수 있음). 동일성은 **event 내용**(EventEnvelope) 기준 — legacyServerRevision은 manifest에 보존만 한다.

## manifest 스키마 (A1 필드 구체화)
```text
{
  sourcePath, sourceFileSha256,          // 원본 파일 무결성
  sourceGitSha?,                          // 있으면
  totalRecords, importedCount, duplicateCount, conflictCount, rejectedCount,
  rejected: [{ lineNo, reason }],         // 손상/비스키마 가시화(은폐 금지)
  epochAssigned: 0,                       // legacy
  localSeqRange: { min, max },
  startedAt, finishedAt,
  verifierHash,                           // 위 규약
  invariants: { I1..I6: pass|fail }       // 정직 기록
}
GO 조건(재확인): conflictCount==0 AND totalRecords==imported+duplicate+rejected
                AND invariants 전부 pass AND verifierHash 재계산 일치.
```

## SimpleMem export 처리
- memory *이벤트*만 대상(검색 인덱스 자체는 import 안 함 — DGX projection으로 재빌드, A1).
- SimpleMem export가 EventEnvelope로 **결정론적 정규화 가능**해야 함. 불가(비결정론적 export)면 → **HOLD**(A1 HOLD 조건 "export가 결정론적이지 않음").
- 정규화된 memory 이벤트도 위 verifier를 동일 통과.

## non-goal (이번 A3)
```text
no import 실행 / no append 코드 (Phase 2)
no AuthoritativeEventStore 구현 (Phase 1)
no protocol/schema/migration 변경 · no EventStorage 동작 변경
no authority flip · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A4 후보: cutover runbook(S0→S4 운영 절차 + epoch quarantine 판정 의사코드 + 드레인 절차).
- A5 후보: offline/reconnect/phone operational truth 검증 설계.
- Phase 2 코드(overseer 승인 후): verifier 구현 + dry-run parity 도구.

## 검증
- inspect-first: `apps/server/src/index.ts:827-831`(record), `:7494-7511`(fingerprint/stableStringify), `:5822`(logical), `:7320-7322`(parse).
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The legacy import verifier is now specified as a deterministic, idempotent parity check reusing the server's existing stable-stringify fingerprint. 이 문서는 *검증 알고리즘 설계* 완료를 뜻하며, import가 실행되었거나 verifier가 구현되었다는 주장이 아니다. 실제 import·append·도구는 overseer 승인 후 Phase 2 코드 작업이다.
```text
A3 import verifier design done (design only). no code/schema changed. STOP.
```
