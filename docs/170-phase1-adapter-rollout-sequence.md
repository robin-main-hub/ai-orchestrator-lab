# A13 Phase 1 Adapter Rollout — PR Bundle & Shadow Sequence (design only)

> **상태**: 설계·문서 전용 (design only). **코드/flag/protocol/schema/migration/EventStorage 동작 변경 없음. flag 추가도 아님 — rollout *절차* 설계.**
> **선행**: A2 `docs/159`(두 계약), A6 `docs/163`(Phase 1 테스트 P1-*), A8 `docs/165`(OPFS 포맷), A9 `docs/166`(outbox 포맷), A10 `docs/167`(controller 재배선), A12 `docs/169`(home_pc).
> **목표**: A7 종합(`docs/164`)이 "Phase 0~2는 부작용 없어 overseer 승인 후 안전 착수 가능"이라 했다. A13은 그 **Phase 1(어댑터 구조 분리)을 머지 가능한 PR 묶음 + shadow 플래그 롤아웃 시퀀스**로 구체화한다. flip은 아니므로(authority 미전환) Phase 1은 hard-gate 아래 단계지만, **shadow→compare→graduate 절차**로 회귀 위험을 0에 수렴시킨다. **롤아웃 절차 설계이지 어댑터/flag 구현이 아니다.**

## 한 줄 요약
Phase 1 ships as four behavior-preserving PRs behind a single VITE shadow flag — adapters land dark, run in dual-write compare against the current cache, and only graduate to primary once parity holds, with instant flag-flip rollback.

## 실측: 재사용할 flag 관례 (정본)
새 flag 메커니즘을 발명하지 않는다. desktop 기존 관례를 따른다.
- desktop flag = `import.meta.env.VITE_*`, boolean은 `=== "true"` 비교(`apps/desktop/src/runtime/stage30DgxEndpoints.ts:37` `VITE_DGX_SERVER_ENABLE_PUBLIC_FALLBACK === "true"`). → Phase 1 shadow flag도 동일 형태: `VITE_AUTH_STORE_SHADOW === "true"`.
- 단일 slot-in 지점(A10) = `useDgxEventSyncController.ts:45-48`. flag 분기는 **이 한 곳**에서만(어댑터 선택). 호출부 4메서드는 A10 매핑대로.
- 어댑터 backend = OPFS primary / IndexedDB fallback(A8), outbox=localStorage(A9). 전부 부작용 없는 로컬 저장(no real network/DB/secret — 루프 경계 준수).

## PR 묶음 (4개, 순서·각자 독립 머지 가능)
각 PR은 **단독으로 동작 보존**(앞 PR이 없어도 회귀 0). flag OFF가 기본.
```text
PR-1  [순수 어댑터 + 단위테스트, 미배선]
  - createAuthoritativeStore(backend)(A8) + createReplicaOutbox(backend)(A9) 구현.
  - rotation/replay 순수함수는 서버 eventLogRotation 재사용(A8).
  - A6 P1-1~P1-7, P2-*(verifier는 별도지만 store contains/readAll 의존분) 테스트.
  - 호출부 무변경 → 프로덕션 경로 무영향(dead code behind no import).
PR-2  [shadow 배선 + dual-write, flag OFF 기본]
  - :45-48에서 VITE_AUTH_STORE_SHADOW=="true"일 때만 두 계약 인스턴스 생성.
  - shadow 모드: 현 LocalClientEventCache가 여전히 primary. 어댑터는 *병행 write*(append/enqueue 미러).
  - read는 여전히 cache(primary). 어댑터는 write만 받아 축적(부작용 0, 비교용).
PR-3  [compare 도구 + parity 리포트]
  - shadow 어댑터 readAll() vs cache 상태를 A3 verifierHash로 비교(P2-5/I5).
  - 불일치 시 콘솔/리포트(silent 금지). dev 전용, 프로덕션 동작 무변.
PR-4  [graduate: 어댑터를 primary로, cache는 read fallback]
  - parity 충족 확인 후 flag를 graduate 단계로(VITE_AUTH_STORE_PRIMARY=="true").
  - read도 authStore.read로(A10 hydrate 포함). cache는 한시적 fallback 후 제거.
  - 동작 불변 체크리스트(A10) 전부 green 필수.
```

## shadow 롤아웃 상태기 (flag 단계)
```text
[OFF]      VITE_AUTH_STORE_SHADOW unset/false. 현 cache 단독. (기본/안전)
   │ PR-2 머지 + flag on(dev)
[SHADOW]   어댑터 dual-write(병행), read=cache. parity 축적.
   │ PR-3 compare가 parity 충족(verifierHash 일치, I1~I6) 지속 확인
[GRADUATE] PR-4 + VITE_AUTH_STORE_PRIMARY=true. read/write=어댑터, cache=read fallback.
   │ 안정 확인(드레인 신호·offline-first 불변, A5 G-1~G-4)
[PRIMARY]  어댑터 단독. cache 코드 제거(별도 cleanup PR).
ROLLBACK:  어느 단계서든 flag→OFF면 즉시 현 cache 단독 복귀(어댑터 write는 부작용 없어 폐기 안전).
```
원자성: flag flip은 **데이터 authority 전환 아님**(여전히 DGX durable authority). 로컬 store *구현체*만 교체. 따라서 cutover(Phase 4)의 atomic epoch-bump와 무관 — 회귀하면 flag 한 줄로 복귀.

## graduate 게이트 (PRIMARY 승격 조건)
```text
[ ] PR-1 어댑터 단위테스트 green (A6 P1-1~P1-7)
[ ] SHADOW에서 dual-write parity: verifierHash(어댑터) == verifierHash(cache) 지속(I5)
[ ] I1~I4(no loss/mutation/dup/accounted) 위반 0
[ ] 드레인 신호 불변: status/outboxCount 전이 동일(A10 체크리스트)
[ ] offline-first 불변: append 선확정 후 push(A5 G-2)
[ ] OPFS 미지원 환경에서 IndexedDB fallback 정상(P1-5)
하나라도 미충족 → GRADUATE 금지(SHADOW 잔류 또는 OFF).
```

## 안전 경계 재확인 (이 롤아웃이 넘지 않는 선)
```text
- authority FLIP 아님: durable authority는 PRIMARY 단계에서도 DGX(A0). MacBook 승격은 Phase 3(epoch).
- protocol/schema/migration 무변경: 로컬 store 구현체 교체뿐, 이벤트 형식·서버 무관.
- no real network/secret/DB: 어댑터는 OPFS/IndexedDB/localStorage 로컬만.
- 본 문서는 flag도 추가 안 함 — PR-1~4의 *순서와 게이트*만 고정.
```

## non-goal (이번 A13)
```text
no 어댑터/flag/compare 도구 구현 (PR-1~4 = overseer 승인 후 Phase 1 코드)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A14 후보: Phase 2(import) 실행 runbook(A3 verifier dry-run→실 import 절차, manifest GO 게이트 운영), 또는 compare 도구 출력 스키마 상세.
- Phase 1 코드(overseer 승인 후): PR-1~4를 본 시퀀스대로.

## 검증
- inspect-first: `apps/desktop/src/runtime/stage30DgxEndpoints.ts:37`(VITE flag `=="true"` 관례), `useDgxEventSyncController.ts:45-48`(단일 분기점). A2/A6/A8/A9/A10 설계 참조.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
Phase 1 ships as four behavior-preserving PRs behind a single VITE shadow flag — adapters land dark, run dual-write compare against the current cache, and graduate to primary only once parity holds, with instant flag-flip rollback. 이 문서는 *롤아웃 시퀀스 설계* 완료를 뜻하며, 어댑터나 flag가 구현되었다는 주장이 아니다. PR-1~4 실제 코드는 overseer 승인 후 Phase 1 작업이고, 이 단계는 authority flip이 아니다(여전히 DGX durable authority).
```text
A13 Phase 1 rollout sequence done (design only). 4 PRs, shadow→compare→graduate, flag-flip rollback. no code. STOP.
```
