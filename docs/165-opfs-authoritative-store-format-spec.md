# A8 OPFS Authoritative Store — File Format & Durability Spec (design only)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음. OPFS 어댑터 구현 아님.**
> **선행**: A1 `docs/158`(storage 결정: OPFS primary + IndexedDB fallback), A2 `docs/159`(`AuthoritativeEventStore` 계약), A3 `docs/160`(fingerprint/verifierHash), A6 `docs/163`(Phase 1 테스트 매트릭스), A7 `docs/164`(종합 — 본 문서는 "특정 Phase 더 깊은 설계 명세" 후속 증분).
> **목표**: A2가 *계약*만 정한 `AuthoritativeEventStore`의 **durable 파일 포맷·내구성 규약**을 못 박는다. 서버가 이미 검증한 append-only JSONL + 세그먼트 로테이션 + boot-replay 모델(`eventLogRotation.ts`)을 web OPFS로 이식하는 형태로 명세한다. **포맷 설계이지 어댑터 구현이 아니다.**

## 한 줄 요약
The MacBook OPFS authoritative store reuses the server's proven append-only JSONL + segment-rotation + boot-replay format, adapted to OPFS sync access handles with explicit flush durability and an IndexedDB fallback.

## 실측: 이식할 검증된 패턴 (정본)
새 durable 포맷을 발명하지 않는다. 서버가 dgx에서 실측 검증한 모델을 그대로 따른다.
- **append-only JSONL**: 서버 `events.jsonl`에 한 줄=한 레코드 append(`eventLogRotation.ts:18`). 변경/삭제 없음 → A2 `AuthoritativeEventStore` append-only 불변식과 동일.
- **세그먼트 로테이션**: 활성 파일이 `maxBytes`(기본 64MB, `:24`) 도달 시 `events.<ms>.jsonl`로 회전(`:34`), 보관 세그먼트 수 상한(기본 16, `:27`)으로 디스크 상한. **무한 성장 방지**(서버 실측: 며칠 만에 92MB → OOM 위험, `:5-6`).
- **boot-replay 순서**: 부팅 시 세그먼트를 오래된→최신(ms 오름차순) + 활성 마지막으로 읽어 상태 복원, dedup이 첫 등장 유지(`:48-58`). → 유실 0.
- **순수 결정 로직 ⟂ I/O 분리**: `shouldRotate`/`rotatedSegmentName`/`orderLogFilesOldestFirst`/`segmentsToPrune`는 파일시스템 없이 테스트(`:13-15`). OPFS 어댑터도 **같은 순수 함수 재사용**(파일시스템만 OPFS로 교체) → A6 테스트 매트릭스가 in-memory fake로 검증 가능.

## OPFS 파일 레이아웃 (durable, append-only)
```text
디렉터리(OPFS root):  authoritative/
  events.jsonl                  # 활성 세그먼트 (현재 append 대상)
  events.<ms>.jsonl             # 회전된 세그먼트 (ms 오름차순 = 시간순)
  manifest.json                 # head 캐시 {epoch, revision, count, lastSegmentMs} (재구축 가능, 권위 아님)
레코드 한 줄 = JSON.stringify(LocalAuthoritativeRecord) + "\n"
LocalAuthoritativeRecord = {
  event: EventEnvelope,         # 권위 데이터 (A3 fingerprint 대상)
  epoch: number,               # MacBook authority generation (legacy import=0)
  localSeq: number,            # 노드 내 단조 증가 순번 (정렬·재생 키)
  appendedAt: string           # ISO 시각 (메타, verifierHash 제외 — A3 규약)
}
```
주의(A3 정합): verifierHash는 `event` 내용만 대상. `epoch/localSeq/appendedAt`는 노드-로컬 메타라 **parity 해시에서 제외**(A3 storedAt/revision 제외 규약과 동일 원리).

## OPFS 내구성 규약 (durable 불변식 충족)
A2 "durable: 브라우저 clear에 견딤, all async" 불변식을 OPFS 기능으로 만족.
```text
WRITE 경로(append):
  1. createSyncAccessHandle()로 활성 events.jsonl 핸들 확보(Worker 컨텍스트).
  2. handle.write(encoded line) at handle.getSize() (파일 끝 = append).
  3. handle.flush()  ← durable 확정점. flush 성공 전엔 append "확정" 아님(no silent ack).
  4. flush 성공 후에만 in-memory head 갱신 + manifest.json 비동기 갱신(캐시).
DURABLE 정의: flush() 반환 == 레코드 durable. 이후 브라우저 재시작/탭 종료에도 보존.
ROTATION: append 전 shouldRotateEventLog(size, maxBytes)==true면
  활성 핸들 close → rotatedSegmentName(now)로 rename → 새 활성 핸들 생성(서버와 동일 결정 로직).
BOOT: orderLogFilesOldestFirst(listDir())로 세그먼트 시간순 읽기 → head/contains 인덱스 재구축.
  manifest.json은 캐시일 뿐 — 불일치 시 세그먼트 재생이 권위(manifest 무시하고 재구축).
```

## A2 계약 메서드 → OPFS 연산 매핑
| A2 메서드 | OPFS 연산 | durable 보장 |
| --- | --- | --- |
| `append(event)` | 활성 세그먼트에 line write + **flush** | flush 성공 = 확정. idempotent: `contains(id)`면 no-op(중복 write 금지) |
| `read(sessionId)` | 인덱스에서 sessionId 필터(boot-replay로 구축) | 읽기 전용 |
| `readAll()` | 전 세그먼트 시간순 + 활성, dedup 첫 등장 유지 | verifierHash·import parity용 |
| `head()` | in-memory `{epoch,revision,count}` (manifest 캐시, 세그먼트가 권위) | revision 단조(감소 금지) |
| `contains(eventId)` | boot 시 구축한 id Set 조회 | 멱등 append·import dedup 판정 |

## IndexedDB fallback 포맷 (OPFS 미지원 시)
```text
DB: authoritative_store, version 1
objectStore "events": keyPath="event.id"(고유 → idempotent append 자연 보장),
  인덱스: by_localSeq(정렬/재생), by_session(read(sessionId))
objectStore "meta": {key:"head", value:{epoch,revision,count}}
durable: IndexedDB 트랜잭션 commit == durable(브라우저 clear 견딤, A2 적격 fallback).
한계: fsync 보장은 OPFS sync handle보다 약함 → primary는 OPFS, fallback만 IndexedDB(A1/A2 결정 재확인).
localStorage: 제외(clear 소실 → durable 위반, A2). outbox 전송상태 캐시 용도로만.
```

## 결정론·검증 연결 (A3/A6)
- `readAll()` 출력 순서 = (epoch, localSeq) 정렬 → 결정론적. A3 verifierHash 입력으로 그대로 사용.
- A6 테스트 매트릭스 적용: P1-2(idempotent append)=`contains` 가드, P1-3(head 단조), P1-5(durable=재생성 후 보존)는 in-memory fake OPFS(Map 기반, `stage29LocalEventStore.test.ts:53-68` 패턴)로 검증. 실제 OPFS handle은 Worker 통합 테스트(Phase 1 코드 시).
- rotation/replay 순수 함수는 서버 `eventLogRotation.test.ts`와 동일 케이스 재사용 가능(파일시스템 fake).

## non-goal (이번 A8)
```text
no OPFS 어댑터 구현 / no Worker 코드 / no IndexedDB 코드 (Phase 1)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급 로직(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A9 후보: IndexedDB 스키마 버저닝·마이그레이션(onupgradeneeded) 설계, 또는 ReplicaOutbox(A2) 영속 포맷 상세.
- Phase 1 코드(overseer 승인 후): OPFS sync-handle 어댑터가 `AuthoritativeEventStore` 구현 + 서버 rotation 순수함수 재사용, flag 뒤 shadow.

## 검증
- inspect-first: `apps/server/src/eventLogRotation.ts:18,24,27,34,48-58,64-71`(append-only+rotation+replay+prune 순수 결정 로직), `stage29LocalEventStore.test.ts:53-68`(in-memory storage fake 패턴). A2 계약·A3 규약 참조.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The MacBook OPFS authoritative store reuses the server's proven append-only JSONL + segment-rotation + boot-replay format, adapted to OPFS sync access handles with explicit flush durability and an IndexedDB fallback. 이 문서는 *파일 포맷·내구성 설계* 완료를 뜻하며, OPFS 어댑터가 구현되었다는 주장이 아니다. 실제 sync-handle·Worker·IndexedDB 코드는 overseer 승인 후 Phase 1 작업이다.
```text
A8 OPFS store format spec done (design only). reuses server rotation/replay pattern. no code. STOP.
```
