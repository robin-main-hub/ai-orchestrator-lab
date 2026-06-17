# Batch 22 (구현 핸드오프) — Sandbox Proposal Shell

> **상태**: 구현 완료 · PR #621 #622 · 선행 Batch 21 docs/127 · forward-loop iter 4
> **목표**: 비활성 placeholder였던 SANDBOX 좌석을 **read-only "proposal only" 표면**으로. 실행/적용/전송/dispatch/write 0.

## 한 줄 요약
SANDBOX 좌석을 활성화하되, 실행이 아니라 **시뮬레이션 제안(proposal)** 표면으로 만든다.
시나리오 제안 카드 + dry-run 배지 + simulated-outcome 라벨 + "PROPOSAL ONLY" 워터마크. 전부 정적 fixture, 실행 0.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #621 | `sandboxProposal.ts`(타입+fixture+isProposalOnly) + `SandboxProposalDeck` + 좌석 활성화 + 렌더 분기 |
| #622 | 본 핸드오프(docs/128) + 체크리스트 §22 |

## 무엇이 보이게 됐나
- SANDBOX 좌석 활성화(INBOX_VIEW_MODES sandbox enabled:true) — 이제 선택 가능.
- `mode==='sandbox'`일 때 SandboxProposalDeck 렌더(정상 live/preview 카드는 sandbox 본문에 누수 0).
- **워터마크**: "PROPOSAL ONLY — 시뮬레이션 미리보기 · 실행/적용/전송 없음 · 모든 결과는 가상".
- **제안 카드**: 제목 + dry-run 배지 + simulated-outcome(pass/warning/blocked 톤) + 제안 단계(steps) + "proposal only · not executed" 노트.
- 전부 표시 전용 — 컨트롤 0, 실행 경로 0.

## 안전 불변식 (0 유지)
```text
runner dispatch 0 · run/execute 0 · file write/patch apply 0 · commit 0 · PR 생성 0
EventStorage write 0 · server write 0 · source sync 0 · hidden job 0 · 모든 outcome은 가상(simulated)
sandboxProposal 순수(정적 fixture) · 컨트롤 0 · generic only(도메인 용어 0) · "proposal only" 워터마크 상시
```

## 검증
신규 테스트: `sandboxProposal.test.ts`(3 — 전부 dry-run/simulated/proposal-only · isProposalOnly 가드 ·
도메인 용어 0) · `AssistantInboxSandboxProposal.test.tsx`(4 — 좌석 선택가능 · 워터마크 · dry-run+simulated ·
read-only/no-leak). 갱신: ViewMode(sandbox enabled+fires) · Persistence(invalid-seat fallback는 non-sandbox 토큰).
인박스+lib 로컬 240 green · typecheck clean · build green · CI green.

## 정직한 한계
SANDBOX는 **제안/시뮬레이션 전용 셸**이다 — 실제 실행은 없다. "실제 sandbox 실행"은 action-risk가 커서
이 배치 범위가 아니며, 한다면 별도 명시 스코프 배치로.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH G — Generic Source Pack Demo(example-source-pack · manifest+provider fixture · Source Dock visible).
- BATCH H — Evidence Draft / Footnote Surface · BATCH J — Command Palette Power Pass · BATCH K — Visual Style Pass.
- 보류 유지: BATCH B(patch queue 통합, docs/125 설계 노트).
