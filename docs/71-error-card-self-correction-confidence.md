# 71 — Error Card + bounded self-correction + ConfidenceSignal (Orchestration OS PR5)

Gemini의 JSON 에러 카드 + Grok의 self-correction loop + SID/엔트로피를 정직하게 결합.
모두 결정적 순수 로직(protocol, 테스트).

## 1. Structured Sandbox Error Card

`sandboxErrorCard.ts`: 터미널 raw log 대신 구조화. **결정적 regex 파서**(AI 요약 후순위)로
TS(`file.ts(line,col): error TSxxxx`)/Python(`File "...", line N` + `XxxError`)/Node
(`TypeError: ... at file:line`)에서 errorClass·targetFile·targetLine·rootCause를 뽑고,
errorClass별 **결정적 directive**를 제안(예: TS2532 nullable → "가드로 보호"). stderrPreview는
clip(redacted). `sandboxErrorSignature`로 같은 에러 비교(loop 차단용).

## 2. Bounded self-correction

`selfCorrection.ts`: `decideSelfCorrection`(순수 결정 함수) — 다음 행동만 계산.
- **무한 loop 금지**: maxAttempts(기본 3) 도달 → `require_human`.
- **같은 에러 반복 중단**: stopOnSameErrorTwice → `stop_same_error`.
- **실패를 자동 성공 처리 금지**: 에러가 없을 때만 `stop_resolved`.
- 역할 게이트: allowedRoles(builder/verifier) 밖이면 require_human.

## 3. ConfidenceSignal (가짜 entropy 금지)

`confidenceSignal.ts`: SID 게이지 함정(모든 provider가 logprobs를 주지 않음)을 피해
**출처별로 분리**. kind = provider_logprobs/verifier_result/debate_disagreement/
self_reported/simulated. `truthStatusForConfidenceKind` — logprobs·verifier→observed,
토론 이견·자가 보고→configured, 데모→simulated. `summarizeConfidence`는 단일 게이지가
아니라 출처별 라인 + **observed 신호만으로 본 headline**(self_reported/simulated는
headline에서 제외). "엔트로피 85%" 단정 금지.

## 정직성 / 후속

- 가짜 observed/가짜 green/가짜 entropy 금지 — 전부 출처와 truthStatus를 분리.
- 라이브 배선(검증 실패 시 error card emit + self-correction 루프 구동 + confidence
  signal 부착)은 통합 작업이라 후속. 이번 PR은 파서·정책·신호 엔진을 테스트와 함께 완성.

## 검증

protocol +14(54 그린), 빌드, server·desktop typecheck. docs/71.

## 다음

PR6 Skill Archive / Curator loop.
