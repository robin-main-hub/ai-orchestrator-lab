# A17 Authoritative Event-ID — Format, Parsing & Validation Spec (design only, flip-gated)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음. flip-gated — epoch 보유(Phase 3+) 전엔 emission 금지. 단 parser는 legacy 공존을 위해 양형 허용으로 설계.**
> **선행**: A1 `docs/158`(event-id `macbook:epoch:seq:uuid` 제안), A3 `docs/160`(legacy normalize epoch=0·localSeq 부여), A8 `docs/165`(LocalAuthoritativeRecord localSeq), A16 `docs/173`(epoch quarantine — observedEpoch 비교).
> **목표**: A1이 *제안만* 한 authoritative event-id 형태(`macbook:epoch:seq:uuid`)를 **문법·파싱·검증 규약**으로 못 박는다. 현 id는 `<prefix>_<uuid>`(epoch 무관)인데(`stage14EventSync.ts:52`, `stage5Runtime.ts:36` 등), flip 후 authoritative id가 epoch/seq를 어떻게 인코딩하고, parser가 legacy id와 어떻게 공존하는지를 고정한다. **포맷·파서 설계이지 id 발급 배선이 아니며, emission은 flip(Phase 3+) 후.**

## 한 줄 요약
The post-flip authoritative event-id is a four-field colon-delimited string node:epoch:seq:uuid whose parser tolerantly coexists with legacy prefix_uuid ids by mapping them to epoch 0, with strict validation only on the authoritative-emitter side.

## 실측: 현 event-id 형태 (정본) — 무엇과 공존하나
- 현 id 생성 = `<domain-prefix>_<crypto.randomUUID()>`: `event_sync_push_<uuid>`(`stage14EventSync.ts:52`), `remote_request_<uuid>`(`stage5Runtime.ts:36`), `dgx_bridge_<uuid>`, `message_system_pipeline_<uuid>`(`conversationPipeline.ts:56`) 등. **epoch/seq 인코딩 없음** — 평면 UUID.
- 동일성·dedup은 id 문자열 전체로(`stage29LocalEventStore.ts` event.id 키). → id 포맷 변경은 **dedup 키 의미를 깨면 안 됨**(전체 문자열 유일성 보존 필수).
- A3는 legacy import 시 `epoch=0`·정렬 localSeq를 *레코드 메타*로 부여(`docs/160:38`)하지 일부러 id 문자열을 바꾸진 않았다. → legacy id는 문자열 그대로 두고, epoch는 레코드 필드로.

## Authoritative Event-ID 문법 (제안 — flip 후 emission)
```text
authoritativeEventId = node ":" epoch ":" seq ":" uuid

node   = "macbook"                      # 발급 노드(현재 단일 authoritative=MacBook). 소문자 [a-z0-9_]+.
epoch  = DIGITS                         # authority generation(A16 split-brain 키). 10진, 선행0 금지(단 "0"=legacy).
seq    = DIGITS                         # 해당 epoch 내 단조증가 localSeq(A8). 10진, 노드·epoch 내 유일.
uuid   = RFC4122 v4                     # 8-4-4-4-12 hex. 전역 충돌 방지(현 randomUUID 계승).
구분자 = ":" (콜론). uuid 내부엔 "-"만, ":" 없음 → 분할 모호성 0.
예:     macbook:7:1024:550e8400-e29b-41d4-a716-446655440000
정렬:   (epoch ASC, seq ASC) = authoritative total order(같은 노드). uuid는 tie-break 아님(seq가 유일).
```
설계 의도: epoch+seq가 **노드 내 결정론적 전순서**를 주고(A8 정렬·A3 verifierHash 입력 안정), uuid가 전역 유일성을 보장(서로 다른 노드/epoch 간 충돌 0). idempotency는 여전히 **id 전체 문자열**로(현 dedup 의미 보존).

## Parsing 규약 (tolerant reader — legacy 공존)
```text
parseEventId(s):
  parts = s.split(":")
  if parts.length == 4 AND parts[0] matches NODE AND parts[1],parts[2] are DIGITS AND parts[3] is UUIDv4:
      return { form:"authoritative", node, epoch:Number(parts[1]), seq:Number(parts[2]), uuid:parts[3], raw:s }
  else:
      # legacy <prefix>_<uuid> 또는 그 외 → 문자열 보존, epoch=0(A3 정합)
      return { form:"legacy", node:"legacy", epoch:0, seq:null, uuid:extractTrailingUuid(s)?, raw:s }
원칙(Postel): reader는 관대 — legacy id를 거부하지 않고 epoch=0으로 매핑(A3 normalize와 동일 값).
            seq=null(legacy는 localSeq를 레코드 메타에서 가져옴, id에 없음).
            raw 항상 보존 → dedup·verifierHash는 raw 문자열 기준(의미 불변).
```
주의: parser는 **부작용 0**(순수 함수). legacy id를 authoritative로 *재작성하지 않는다* — 단지 epoch=0으로 *해석*만. id 문자열 자체는 불변(A3: 원본 무변경).

## Validation 규약 (strict writer — emitter 측만)
```text
validateAuthoritativeEventId(s, expectedEpoch E, expectedNode N):
  p = parseEventId(s)
  REQUIRE p.form == "authoritative"          # emitter는 authoritative 형식만 발급
  REQUIRE p.node == N                          # 노드 일치(현 N="macbook")
  REQUIRE p.epoch == E                         # 현 authority epoch과 일치(A16: 불일치→quarantine 대상)
  REQUIRE p.seq == nextSeq(E)                  # 단조 +1(gap/중복 금지, A8 localSeq 규칙)
  REQUIRE p.uuid is fresh (미사용)             # 전역 유일
  실패 → emit 거부(잘못된 id 발급 방지). 이것은 *수신 검증*이 아니라 *발급 자기검증*.
수신 측(A16): observedEpoch != localEpoch면 quarantine — validation이 아니라 quarantine 경로로.
              즉 strict validation은 *내가 만드는* id에만, *받는* id는 quarantine 트리로 관대 처리.
```
비대칭 핵심: **발급=strict, 수신=tolerant+quarantine**. 받는 id를 strict 거부하면 split-brain write가 silent drop됨(A16 위반) → 수신은 항상 parse→epoch 비교→quarantine.

## legacy 공존·migration 영향 (no rewrite)
```text
- 기존 평면 id(event_sync_push_<uuid> 등)는 그대로 유효 → form:"legacy", epoch:0.
- import(A15)은 id 문자열 미변경, epoch=0은 레코드 메타(A3)로. id 재작성 0 → migration 불필요.
- dedup·verifierHash는 raw 문자열 기준이라 legacy/authoritative 혼재 set도 안정(A3 fingerprint는 event 전체).
- flip 후 신규 authoritative 이벤트만 macbook:E:seq:uuid 형식 emit. 과거 이벤트 소급 변경 없음.
→ protocol/schema 변경 0: id는 여전히 string 타입. 형식 규약은 emitter 관례이지 타입 변경 아님.
```

## 왜 지금 emission 배선 안 하나 (flip gate)
```text
authoritativeEventId의 epoch은 MacBook이 epoch 보유 authority일 때만 의미(Phase 3 발급).
flip 전 emit하면 비교할 localEpoch 없음 → epoch 값이 임의(무의미) 또는 0과 혼동.
→ 본 문서는 문법·parser·validator 규약만 고정. 실제 id emit 배선은 Phase 3(epoch 발급)+overseer.
  단 parser/validator는 순수 함수라 미리 단위테스트 가능(A6 P-series, 부작용 0) — 단 이번 PR은 docs only.
```

## non-goal (이번 A17)
```text
no id 발급 배선 / no parser/validator 코드 (Phase 3+ emission, overseer 승인 후)
no 기존 id 재작성 / no migration (legacy 문자열 불변)
no protocol type/schema 변경(id는 여전히 string) · no EventStorage 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A18 후보: Phase 1 어댑터 단위테스트 케이스 상세(A6 P1-* 구체화 — append/read/readAll/contains/idempotent 케이스 표), 또는 ReplicaOutbox↔AuthoritativeStore 재구축(rebuild) 절차 상세(A9 손실복구 운영 단계).
- Phase 3+ 코드(overseer 승인·flip 후): id emitter + parser/validator + 단위테스트.

## 검증
- inspect-first: 현 id 생성 `apps/desktop/src/runtime/stage14EventSync.ts:52`, `stage5Runtime.ts:36,48,101,113,124`, `conversationPipeline.ts:56`(평면 `<prefix>_<uuid>`), dedup 키 `stage29LocalEventStore.ts`(event.id 전체 문자열). A1 제안·A3 epoch=0 normalize·A8 localSeq·A16 epoch 비교 참조. 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The post-flip authoritative event-id is specified as node:epoch:seq:uuid with a tolerant parser that maps legacy prefix_uuid ids to epoch 0, strict self-validation only on the emitter side, and no rewrite of existing ids. 이 문서는 *event-id 포맷·파싱·검증 규약 설계* 완료를 뜻하며, id emitter나 parser가 구현·배선되었다는 주장이 아니다. emission은 flip(Phase 3+) 후 overseer 승인 작업이고, 이 단계는 authority flip이 아니다(legacy id 불변, 여전히 DGX durable authority).
```text
A17 authoritative event-id format/parse/validate spec done (design only, flip-gated). node:epoch:seq:uuid, tolerant reader(legacy→epoch0), strict emitter self-validate, no rewrite. no code. STOP.
```
