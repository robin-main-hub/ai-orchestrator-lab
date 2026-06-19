# A26 Phase 5 Phone Pending-Intent → Authoritative Conversion — Test Cases (design only, flip-gated)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님. 🔒 flip-gated — 본 테스트가 검증하는 intent 변환자는 *순수 함수*로 단위테스트 가능하나, /intents 라우트·MacBook 변환자·phone UI 변경 배선은 Phase 5(flip 후) overseer 승인. 본 문서는 수용 기준만 고정하고 배선·flip을 승인하지 않는다.**
> **선행**: A6 `docs/163:72-78`(Phase 5 매트릭스 P5-1~P5-4 *한 줄*), A11 `docs/168`(PendingIntent 레코드 포맷 + submitted→accepted|declined_by_authority 수명주기), A5 `docs/162`(phone 직행 server-author = target 불일치 증거), A1 `docs/158`(phone=stateless thin client·MacBook 변환자), A24 `docs/181`·A25 `docs/182`(Phase 3·4 — 변환자가 부여하는 epoch/revision의 선행), A22 `docs/179`(Phase 5=🔒flip-gated gap).
> **목표**: A24(Phase 3)·A25(Phase 4)가 epoch/cutover를 상세화했다. A26은 flip-gated 트랙의 마지막 단계로 A6 P5-1~P5-4(한 줄)을 given/when/then으로 못 박는다. 검증 대상은 **순수 변환 함수**(PendingIntent + 검증 컨텍스트 → authoritative event | declined)라 부작용 0 단위테스트 가능 — 단 /intents 라우트·변환자·phone UI 배선은 flip 후 Phase 5. 이로써 **flip-gated 테스트 트랙(Phase 3·4·5)이 전부 상세화 완결**된다. **테스트 명세 설계이지 변환자 구현도 phone 경로 변경도 아니다.**

## 한 줄 요약
The phone-intent→authoritative conversion is specified as given/when/then tests over a pure converter — a phone PendingIntent never self-confirms, only MacBook (epoch holder) converts a validated intent into an authoritative event with epoch+revision, DGX authors nothing post-flip, and no intent is lost across reconnect (idempotent by intentId) — all behind the flip gate so no route/UI is wired.

## 실측: 검증 대상 (정본, A11 PendingIntent + 변환자)
```text
PendingIntent (A11 docs/168:16-25):
  { intentId(멱등 클라 UUID), kind, sourceItemId, proposedDecision:"grant"|"reject",
    actor:"mobile", reason, submittedAt, deviceId }
  핵심: 결정이 아니라 *결정 요청* — proposedDecision은 제안일 뿐 authoritative 확정 아님.
convertIntent(intent, ctx) → { accepted: AuthoritativeEvent } | { declined_by_authority, reason }   # 순수 함수
  ctx = { sourceItemExists, sourceItemPending, actorHasPermission, alreadyProcessedIntentIds:Set, currentEpoch E }
  검증(A11 docs/168:36-39): sourceItemId 실재·pending? · actor 권한? · intentId 미처리(멱등)?
  accepted: MacBook이 authoritative approval 이벤트 author(epoch E + revision 부여, A8 append).
  declined_by_authority: 검증 실패(권한 없음/이미 처리/만료) → intent 거부(가시화, silent 0).
oracle: fingerprintEvent(`apps/server/src/index.ts:7494-7511`). idempotencyKey 의미는 intentId.
no real network/DB: 변환자 순수, in-memory intent/ctx fixture. /intents 라우트 미존재(flip 후).
```

## P5 케이스 상세 (A6 P5-1~P5-4 → given/when/then)

### P5-1 phone pending-intent 제출: authoritative 직행 아님
```text
given: phone이 PendingIntent{intentId:"i1", proposedDecision:"grant", actor:"mobile", sourceItemId:"a1"} 제출.
when:  intent가 hub 경유 변환 큐 진입(변환 *전* 상태 관찰).
then:  intent.state === "submitted"; authoritative 효력 0(approval 이벤트 미생성).
       proposedDecision:"grant"여도 변환 전엔 승인 아님 — authoritative set에 a1 승인 0.
       (현 모델과 대비: 현 Approvals.tsx는 서버가 *즉시* author — A5 target 불일치를 이 케이스가 교정)
근거: A11 "PendingIntent는 결정이 아니라 결정 요청". phone-asserted를 final 신뢰 안 함.
```

### P5-2 MacBook이 intent→authoritative 변환자
```text
given: intent{i1, grant, a1}, ctx={sourceItemExists:true, sourceItemPending:true, actorHasPermission:true, alreadyProcessed:∅, E:5}.
when:  convertIntent(intent, ctx).
then:  결과 === { accepted } — authoritative approval 이벤트 생성.
       그 이벤트만 epoch(5)+revision 부여(A8 store append). intent 자체엔 epoch 없음(변환 산출물에만).
       변환 후에만 authoritative — 변환이 유일 진입(phone·DGX 직행 0).
edge-거부: actorHasPermission:false → { declined_by_authority, reason:"no_permission" }, 이벤트 생성 0.
       sourceItemPending:false(이미 처리) → declined(reason:"already_processed").
근거: A11 accepted 분기 + A1 "MacBook authoritative converter". 권위 부여는 변환자만.
```

### P5-3 DGX는 projection/replica만 (승인 author 금지, flip 후)
```text
given: flip 후(Phase 4 완료) 상태. intent 도착.
then:  DGX는 authoritative approval 이벤트를 author하지 *않음* — projection/replica 경로만.
       현 server-owned author 가드(index.ts:5837,7136-7140 의 403 정신)가 MacBook 변환자로 이관됨.
       즉 변환 권위 노드 정확히 1(=MacBook), DGX는 0(post-flip).
근거: A1/A5 "DGX=projection/replica". flip 후 server-author 경로 제거 — 권위 단일 노드 불변(A25 P4-3 정합).
주의: 🔒 이 케이스는 flip 완료를 전제 — server-author 제거 배선은 Phase 5 overseer 승인 후. 본 명세는 *제거되면 만족할* 불변만 고정.
```

### P5-4 intent 손실 0: 드레인/재연결 멱등
```text
given: phone offline에서 intent i1 제출(미확인). 재연결.
when:  phone이 i1 재제출(intentId 동일).
then:  변환자가 alreadyProcessed에 i1 있으면 no-op(중복 author 0, 같은 결과 반환).
       i1 미처리면 그제야 변환 — over-submit 안전(멱등), under-submit은 phone 재시도로 흡수.
       offline intent도 재연결 시 변환 큐 유지 → 손실 0.
edge-declined 재제출: 이미 declined인 i1 재제출 → 동일 사유 반환(재author 0, A11 멱등).
근거: A11 "손실: intent durable 아님 → 미확인 시 재제출, intentId로 안전". A25 드레인 멱등(P4-2)과 동형.
```

## 권위 분리 불변 케이스 (A11 보안 핵심)
```text
PS-1 proposedDecision 비신뢰: intent.proposedDecision:"grant"라도 ctx 검증 실패 시 declined.
     phone이 보낸 결정값이 authoritative 결과를 *강제하지 못함*(변환자 검증이 최종).
PS-2 변환 권위 단일: 어떤 케이스도 phone/DGX가 authoritative 이벤트를 직접 만들지 않음 —
     authoritative event 생성 경로 === MacBook convertIntent의 accepted 분기 단 하나.
PS-3 declined 가시화: declined_by_authority는 사유와 함께 노출(silent drop 0, A11/A4 정신).
근거: A11 "권위 분리의 핵심(보안)". phone-asserted 결정 final 신뢰 금지 — 현 403 가드 정신을 변환자로 이관.
```

## 결정론·격리 불변 (전 케이스 공통, 루프 안전)
```text
- convertIntent()는 순수 함수(intent + ctx → accepted | declined) — real /intents 라우트·네트워크·DB 0.
- 고정 fixture(고정 intentId·ctx·submittedAt) → 변환 결정·fingerprint 재현(flaky 0).
- 🔒 본 문서 어디서도 /intents 라우트·변환자·phone UI 변경·server-author 제거를 승인하지 않음 — Phase 5(flip 후) overseer 게이트 유지.
- authoritative event 생성은 오직 변환자 accepted 분기 — phone/DGX 직행 경로 부재가 전 케이스 불변(권위 단일 노드).
- declined/거부는 사유 텍스트만, 페이로드 전문·secret 0(A9/A11 정신).
```

## flip-gated 테스트 트랙 완결 의미
```text
A24(Phase 3 epoch/quarantine)·A25(Phase 4 cutover)·A26(Phase 5 intent 변환) = flip-gated 트랙 3단계 전부 상세화.
A22 커버리지 맵의 🔒 gap(P3·P4·P5)이 모두 given/when/then 수용 기준 보유 →
  A-series 테스트 트랙 *전체*(non-gated Phase 0~2 + controller + compare + flip-gated Phase 3~5)가 상세화 완결.
남는 것은 전부 *코드*: overseer 승인 후 Phase 0~2(비-flip) → flip 승인 시 Phase 3~5. 설계 잔여 0.
```

## non-goal (이번 A26)
```text
no 테스트 구현 / no 변환자·/intents 라우트 구현 / no phone UI 변경 / no server-author 제거 (전부 Phase 5 flip 후 overseer 승인)
no authority flip 실행 · no epoch 발급 · no cutover
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no WorkItem · no native shell · no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- **flip-gated 테스트 트랙 완결**: Phase 3·4·5 전부 상세화 — A-series 설계 트랙의 *테스트 명세* 잔여 소진.
- A27 후보(non-gated, 선택): A-series 테스트 트랙 최종 인덱스 v2(A22 `docs/179` 커버리지 맵을 P3~P5 ✅로 갱신 — 전 행 상세문서 추적 완성표), 또는 overseer 승인 대기 게이트 요약 문서(어떤 결정이 어떤 Phase 코드를 푸는지).
- overseer 승인 후 코드: Phase 0~2(A8/A9 어댑터+A10 재배선+A13 PR-1~4, baseline freeze=회귀 게이트) → flip 승인 시 Phase 3~5(본 A24~A26 명세대로).

## 검증
- inspect-first: A6 `docs/163:72-78`(P5-1~4 매트릭스), A11 `docs/168:16-60`(PendingIntent 포맷·수명주기·검증·현 payload 매핑·보안), A5 `docs/162`(phone 직행 불일치), A1 `docs/158`(MacBook 변환자), `apps/desktop/src/.../Approvals.tsx:58-62`(현 payload)·`apps/server/src/index.ts:5837,7136-7140`(server-author 403 가드)·`:7494-7511`(fingerprint oracle), A24/A25(epoch·cutover 선행). 새 primitive·새 케이스 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The phone-intent→authoritative conversion is specified (P5-1~P5-4 + PS-1~PS-3) as given/when/then tests over a pure converter: a phone PendingIntent never self-confirms, only MacBook converts a validated intent into an authoritative event with epoch+revision, DGX authors nothing post-flip, no intent is lost across reconnect (idempotent by intentId), and the phone-proposed decision never forces the result. 이로써 flip-gated 테스트 트랙(Phase 3·4·5)이 전부 상세화 완결된다. 이 문서는 *테스트 케이스 설계* 완료를 뜻하며, 변환자·/intents 라우트·phone 경로가 구현·배선되었다는 주장이 아니다. 본 문서는 그 어떤 배선·server-author 제거·flip도 승인하지 않으며(🔒 overseer 게이트 유지), 이 단계는 authority flip이 아니다(여전히 DGX durable authority).
```text
A26 phase 5 phone intent conversion test cases done (design only, flip-gated). P5-1~4 + PS-1~3 given/when/then over pure converter, no self-confirm + MacBook-only conversion + DGX authors nothing + idempotent-by-intentId no loss. flip-gated track (Phase 3·4·5) now fully specified. no tests/code/wiring. not a flip. STOP.
```
