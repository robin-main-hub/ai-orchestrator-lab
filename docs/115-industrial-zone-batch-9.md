# Batch 9 (구현 핸드오프) — Semantic Work Desk

> **상태**: 구현 완료 · PR #575 #576 #577 #578 · 지시 정본 docs/110 Batch 9 LINE A~E
> **선행**: Batch 8 docs/114 (영속·Today/Recent·REPLAY·layout). 본 배치는 "이게 무슨 일인지"를 OS가 읽게.

## 한 줄 요약
generic OS 이벤트를 읽을 수 있는 범주(failure/learning/runner/approval/memory/project/system)로 분류하고, Today/Recent 배지·REPLAY 필터·WorkItem-lite 행으로 의미를 입혔다. ERP/GIO 도메인 0. SANDBOX 계속 보류.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #575 | A | generic event classifier (`classifyEvent`) |
| #576 | B | Today/Recent 행 의미 배지 |
| #577 | C | REPLAY read-only 범주 필터 |
| #578 | D/E | WorkItem-lite projection + 본 핸드오프(docs/115) + 체크리스트 |

## LINE 요약
- **A** — 순수 `classifyEvent(type)` → failure/learning/runner/approval/memory/project/system/unknown. 순서 있는 generic substring 규칙(learning이 failure보다 먼저 → learning-loop failure는 learning), best-effort·결정론, unknown 유지. 도메인 로직 0, side-effect/Date.now 0.
- **B** — work-queue 레인 아이템에 optional category. Today/Recent 행(실제 이벤트 기반)에 범주 배지. 비-이벤트 레인은 범주 날조 0, 빈 상태 정직, read-only.
- **C** — REPLAY에 read-only 필터(all/failure/learning/runner/memory/approval/system) radio + 행별 범주 배지. **local UI state만** — 데이터 mutation 0·EventStorage write 0·server 0. all 복귀 시 전체 복원(무변형 증명). 범주별 항목 없으면 honest empty.
- **D** — 순수 `projectWorkItemsLite(events, records?)` → read-only `{id,title,category,status,source,createdAt,observed}`. **WorkItem 자동화 아님**(생성/write/lifecycle 0). REPLAY 행을 WorkItem-lite로 렌더(title+category+source), 필터는 projected category 기준. 이벤트 observed:true, project record는 suggested/observed:false(정직).
- **E** — 본 문서 + 체크리스트 Batch 9 regression.

## 검증
- 신규 테스트: A +3, B +2, C +2, D +4 = **+11**. 인박스+lib 스위트 그린. root typecheck·build·secret green(4 PR CI). classifier/WorkItem-lite 순수성·무변형은 단위테스트로 고정(no-domain·no-mutate).
- 분류는 best-effort라 실제 eventLog 타입에 따라 unknown 비율이 다를 수 있음(정직) — REPLAY 필터/배지로 즉시 확인 가능.

## 안전 불변식 (0 유지)
```text
ERP/GIO import 0 · fake live 0 · external send 0
server append/write 0 · runtime skill load 0 · DB migration 0
hidden background job 0 · new action button 0 · preview→live 누수 0
replay mutation 0 · approval semantics 변경 0
WorkItem-lite는 read-only projection(자동 생성/write 0)
```

## 미접촉 / 다음 후보 (오너 권장 순서)
- **Batch 10**: search / filter (inbox 검색·command palette hook).
- **Batch 11**: SANDBOX shell (시뮬레이션/dry-run — action-risk라 계속 보류 중).
- **Batch 12**: plugin/WorkItem real source (실제 WorkItem 소스 배선).
- 그 외: Today/Recent 범주별 롤업, REPLAY 타임라인 스크럽, classifier 규칙 정밀화.
