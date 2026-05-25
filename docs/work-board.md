# Work Board (Claude × Codex 협업 상태)

Claude와 Codex가 같은 repo를 분업할 때 서로의 작업 상태와 합의를 한 페이지로 보기 위한 작업판.

관련 문서: [`review-board.md`](review-board.md) (외부 검토자 리뷰), [`24-provider-adapters.md`](24-provider-adapters.md) (LlmAdapter), [`29-permission-engine-spec.md`](29-permission-engine-spec.md) (Permission/Redaction), [`30-security-audit-checklist.md`](30-security-audit-checklist.md) (보안 감사), [`31-streaming-layer-spec.md`](31-streaming-layer-spec.md) (streaming v1), [`32-memory-adapter-spec.md`](32-memory-adapter-spec.md) (MemoryAdapter contract).

마지막 갱신: 2026-05-25 라운드 3 (F1~F5 permission stack 완성 + Claude 어댑터 caching/SOULs/spec 평행 라운드).

## 1. 협업 규칙

- **Branch prefix**: `claude/...` (Claude 작업) vs `codex/...` (Codex 작업).
- **Commit trailer**:
  - Claude: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  - Codex: `Co-Authored-By: Codex GPT-5 <noreply@openai.com>`
- **PR title prefix**: `[claude] ...` / `[codex] ...`.
- **파일 점유 룰** (동시 작업 금지):
  - Codex 영역: `apps/desktop/**`, `apps/mobile/**`, `apps/server/src/index.ts`, `packages/providers/src/openAiCompatibleAdapter.ts`, `packages/providers/src/node/codexCliOAuthAdapter.ts`, README + docs authority 문서 + Stage6 seed
  - Claude 영역: `packages/providers/src/anthropicAdapter.ts`, `packages/providers/src/ollamaAdapter.ts`, `packages/providers/src/contractTestFixtures.ts`, `packages/agents/src/**`, `agents/<persona>/SOUL.md` + `AGENTS.md`, `docs/24~32` 신규
  - 양쪽 다 신중히: `packages/protocol/src/index.ts` (Claude는 신규 schema 추가만, Codex가 permission 타입 변경 중일 때는 Claude 0 touch)
  - 같은 파일을 만지기 전엔 work-board에 알리고 다른 쪽이 잠시 멈춘다.

## 2. 머지된 작업

### R2 → R3 사이에 머지된 항목

- ✅ **#31 Ollama adapter (γ)** — 로컬 fallback, 21 tests
- ✅ **#33 contract test fixtures** + OpenAI-compat / Anthropic 적용 (93 tests)
- ✅ **#34 docs/24·25·26 implementation status sync**
- ✅ **#35 docs/29 Permission engine spec** (F1~F10 로드맵)
- ✅ **#36 docs/seed authority correction** (Codex — DGX-02 authority 표기 정정)
- ✅ **#37 docs/30 Security audit checklist**
- ✅ **F1 Codex permission gate foundation** (`ad1fb26`) — protocol schema + evaluator skeleton
- ✅ **Codex desktop event outbox consolidation** (`85eaa0a`)
- ✅ **Codex DGX authority memory model restore** (`7d315d8`)

### R1 라운드 (기존 머지 항목 요약)

- 보안/인증: #9 C1 Bearer auth + CORS, #10 C2 Zod + body limit + secret redact, #17 desktop bearer, #19 stage32 DGX 진단, #20 large body 413 hotfix
- 어댑터 인프라: #18 PR α (LlmAdapter + AdapterError 9 cat + MockLlmAdapter), #21 Codex OAuth main provider, #22 ESM fix, #24 OpenAI-compatible adapter, #25 smoke Codex OAuth, #29 Anthropic adapter (β) + server migration, #30 server legacy cleanup
- mobile / agents / docs: #11~#16 Claude PR 7개 (agents safety, work-board v1, docs/24~27, mobile PWA), #23 mobile polish, #26 탭바 + cap, #27 agents lifecycle fix, #28 DGX vLLM 모델 id, #32 seed authority correction

총 머지 카운트: 약 30+ PR (Claude + Codex 합산).

## 3. 진행 중 (open PR — 9건)

### Codex permission stack (F2~F5, stacked)

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#42](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/42) | `main` | F2 server permission gate — `/provider-completions` + `/remote-runs`에 evaluator 통합 | MERGEABLE |
| [#44](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/44) | `#42` | F3 desktop approval UX (sibling of #46) — 채팅 안 승인 패널 + composer 복원 retry | MERGEABLE |
| [#46](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/46) | `#42` | F4 server `/approvals/list,grant,reject` endpoints + Event Store 기록 | MERGEABLE |
| [#47](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/47) | `#46` | F5 mobile approval queue — 폰에서 승인/거절 + 처리 내역 | MERGEABLE |

머지 순서: **`#42 → (#44, #46) → #47`**. #44와 #46은 sibling이라 둘 중 어느 쪽 먼저든 OK.

### Claude solo PR (5건, 독립)

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#41](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/41) | `main` | Ollama adapter contract test 적용 (120 tests) | MERGEABLE |
| [#43](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/43) | `main` | Anthropic prompt caching opt-in (`enablePromptCaching` + `cacheStrategy`, 130 tests) | MERGEABLE |
| [#45](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/45) | `main` | docs/31 streaming layer spec (4 어댑터 → token-by-token 설계 합의, 9 결정점) | MERGEABLE |
| [#48](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/48) | `main` | 5 virtual agent SOULs (architect / reviewer / skeptic / verifier / memory_curator) | MERGEABLE |
| [#50](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/50) | `main` | docs/32 memory adapter spec (`MemoryAdapter` contract, 11 결정점) | MERGEABLE |

Claude 5건 모두 서로 다른 layer (providers test / providers code / docs spec / agents data / docs spec) — 머지 순서 자유.

검증 상태: 모든 PR에 `pnpm typecheck` + `pnpm test` 통과. providers 120~130 tests.

## 4. 다음 작업 우선순위

### Codex 다음 진입

- (F1~F5 머지 라운드 정리 후) **F6 evaluator 정책 매트릭스 보강** — docs/29 §5 결정 1번 (hardcoded TS vs JSON vs DB row) 회신 받은 뒤
- **F7 redaction pipeline 5-stage** (현재 1, 2단계만 구현) — secret detect, prompt_inject filter, pre_persist, pre_backup
- **F8 audit log 영속화** — Event Store 측 신규 schema
- **F9 ingress receiver** (telegram / mobile webhook) — 별도 channel 인입 + permission gate 통과
- **F10 tmux dispatch** — F1~F9 다 통과 후

### Claude 다음 진입

순서 의존:

1. **debate engine 실 실행** — `packages/agents`. F2 evaluator + F4 budget guard + F5 approval flow가 main에 있어야 호출 가능. 머지 라운드 끝나면 즉시 진입. 2~3시간. evaluator + adapter + 5 SOULs (#48) 다 받아서 자연스럽게 조립.
2. **M1 memory workspace** (docs/32 결정 회신 후) — `packages/memory/` 워크스페이스 + `MemoryAdapter` 인터페이스 + `MockMemoryAdapter` + 6 contract fixtures. 의존 0. 1~2시간.
3. **streaming P1** (docs/31 결정 회신 후) — protocol에 `ProviderCompletionChunkEvent` 추가 + `MockLlmAdapter.completeStreaming()` + 5 streaming contract fixtures. **단, protocol 추가는 Codex permission 작업 끝난 뒤**. 1시간.
4. **OpenRouter adapter** — 사실상 Codex 영역 (OpenAI-compatible 재사용). Codex가 양보하면 Claude가 패턴 그대로 1시간.

### 잠금 해제 의존 표

| 작업 | 잠금 해제 조건 |
|---|---|
| debate engine 실 실행 | F2 + F4 + F5 머지 + 5 SOULs (#48) 머지 |
| M1 memory adapter workspace | docs/32 결정 회신 |
| streaming P1 | docs/31 결정 회신 + Codex permission protocol 작업 종료 |
| ERP 도메인 entries (`payment_action` 등) | F1~F10 다 머지 + 보안 감사 통과 |
| Multi-channel ingress (telegram, mobile webhook) | F9 |
| tmux dispatch | F10 |
| 모바일 승인 큐 UI 추가 기능 | F5 머지 (#47) — 이미 PR 떴음 |

## 5. 결정 대기

### docs/29 6개 결정 (R2부터 누적)

1. 정책 매트릭스 위치 — hardcoded TS vs JSON vs DB row
2. approval TTL 기본값
3. 2FA 메커니즘 — 모바일 push + 코드 vs telegram bot inline button
4. PermissionMatrixItem 영속화 — Event Storage vs 별도 audit log
5. untrusted source memory recall — 차단 vs summary only
6. Redaction 위반 처리 — 자동 치환 vs 거부 (scope 별)

### docs/31 9개 결정 (PR #45)

1. **인터페이스**: `complete()` `stream` 플래그 vs 별도 `completeStreaming?()` — Claude 추천 옵션 B
2. **Transport**: SSE vs WebSocket — Claude 추천 SSE
3. **Usage 이벤트 emission**: stream 중 0~N회 vs 마지막에만 — Claude 추천 0~N회
4. **Reconnect**: 64-chunk sliding window vs 미지원 — Claude 추천 v1 미지원
5. **Codex CLI streaming schema**: CLI 1.0.x 실 schema 확인 필요
6. **Server multiplex**: 한 SSE에 여러 stream vs stream당 SSE — Claude 추천 1:1
7. **Throttle**: 즉시 flush vs 50ms batch — Claude 추천 모바일은 batch, 데스크톱은 즉시
8. **Tool use 이벤트**: streaming 발신 vs 만나면 종료 — Claude 추천 v1은 종료
9. **SSE 인증** (§16.1): EventSource Cookie/query vs `fetch()` + ReadableStream — Claude 추천 후자

### docs/32 11개 결정 (PR #50)

1. 새 워크스페이스 `packages/memory` vs `packages/providers` 동거 — Claude 추천 새 워크스페이스
2. `reflect()` 어댑터 책임 vs 별도 service — Claude 추천 optional method
3. DgxSimpleMem `remember()` 반환 타입 — Claude 추천 `promotion_pending` error throw
4. Memento MCP `pin` 미지원 시 대안 — Claude 추천 metadata 매핑 우선, 미지원 시 sidecar table
5. `memoryContext` streaming 필요 여부 — Claude 추천 v1 buffered
6. Trust enforcement: caller 책임 vs adapter wrapper — Claude 추천 wrapper
7. `forget` 시 secret storage 처리 — Claude 추천 별도 worker
8. `pin`/`forget`/`activate` 동기 vs 비동기 일관 — Claude 추천 모두 Promise, 비동기 backend는 `promotion_pending` 일관
9. Event Store schema 추가 memory events 17개 — Claude 추천 M1 PR에 한꺼번에
10. (§11.x 결정점 중) MemoryAdapter 의존을 별도 신규 패키지로 분리할지 — Claude 추천 그렇게
11. memory_curator 페르소나 호출 budget — `provider_call` budget 안에서

### 기타

- Anthropic prompt caching 활성화 시점 — PR #43 머지 후 첫 caller가 `enablePromptCaching: true`로 전환할 시점 (현재 default off)
- Ollama 실 호스팅 위치 — DGX-02 vs desktop-local (RAM 안전 3룰 통과 후)
- OpenRouter adapter 담당 — Codex base 재사용 vs Claude 별도

## 6. 알려진 위험 (요약)

상세는 [`docs/30-security-audit-checklist.md`](30-security-audit-checklist.md) §7.

| 위험 | 등급 | 닫힐 시점 |
|---|---|---|
| Permission/Approval enforcement (typed only) | High → **거의 닫힘** | F1~F5 PR (#42/#44/#46/#47) 머지 시 |
| Redaction pipeline 5 stage 중 3,4,5 미구현 | Medium | F7 |
| Ingress receiver 0 구현 | Medium | F9 |
| Audit log 영속화 | High → **부분 진행** | F4 (#46) → F8 |
| 2FA (device_reboot, secret_view, payment) | High | F4~F5 (#46/#47 + 결정 3) |
| Backup/Export redaction (pre_backup) | High | F7 |
| Server rate limit 부재 | Low (지금) → High (외부 사용자 증가 시) | 별도 PR |
| Provider OAuth refresh layer | Medium | F4 또는 별도 |
| ERP-도메인 actions 정책 미정 | High (ERP 진입 시) | ERP 진입 직전 |
| **Streaming layer 부재** (모든 응답 buffered) | Medium (UX) | docs/31 결정 회신 → P1~P7 |
| **Memory backend 0** (LocalHeuristic 폴백만) | Medium (장기 기억 0) | docs/32 결정 회신 → M1~M6 |

## 7. 분담 안 한 작업 (양쪽 다 안 잡음)

R2 대비 정리됨:

- ~~Virtual agent 5개 SOUL 파일~~ — ✅ **PR #48로 닫힘**
- ~~Memento MCP 실연동 spec~~ — ✅ **PR #50으로 spec 닫힘**, 구현(M1~M6)은 결정 회신 후 진입
- streaming layer (`stream: true` 어댑터 통합) — ✅ **PR #45로 spec 닫힘**, 구현(P1~P10)은 결정 회신 후

여전히 미정:

- Tool use / function call — Anthropic / OpenAI 명세 차이 어댑터 통합 후
- Multimodal (image / document) — ModelDescriptor에 flag만, 어댑터 미구현
- Coding Packet 실행 게이트 — packet 검증은 있고 실 실행 0
- Obsidian/Notion 실 file writer — projection 타입만, fs/API 호출 0
- review-board.md Stage 1~42 reclassification — 코덱스가 양보한 후보, 현재 미배정

## 8. 최근 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-05-25 R1 | 협업 룰 (branch/trailer/PR prefix + 파일 점유) | 별도 GitHub 계정보다 관리 부담 작음 |
| 2026-05-25 R1 | C1 → C2 순서로 분리 커밋 | 접속 차단이 CORS인지 body validation인지 추적 가능 |
| 2026-05-25 R1 | 어댑터 순서 vLLM → OpenAI → Anthropic → Ollama → OpenRouter | 실제 시운전 축 + OpenAI-compatible 골격 재사용 |
| 2026-05-25 R1 | 어댑터 1차에 streaming/tool use 비포함 | 5개 buffered 검증 후 별도 PR |
| 2026-05-25 R1 | Codex OAuth를 메인 provider로 채택 | 빠른 응답, dense qwen은 RAG/문서/오프라인용 폴백 |
| 2026-05-25 R1 | Codex OAuth는 CLI subprocess (A안) | `codex serve` 부재로 C안 불가, B안은 약관 risk |
| 2026-05-25 R1 | Cloudflare Tunnel로 endruin.com 외부 노출 | DNS DGX-02 직접 노출보다 NAT/TLS/IP 변경 자동 |
| 2026-05-25 R2 | Anthropic adapter는 `x-api-key` 사용 | 기존 raw fetch의 `Authorization: Bearer` 잘못 |
| 2026-05-25 R2 | `ProviderCompletionUsage`에 cache 필드 추가 | Anthropic prompt caching usage 정확 보고 |
| 2026-05-25 R2 | server anthropic_messages도 어댑터 통과 | OpenAI-compatible과 대칭 + raw fetch dead code 제거 |
| 2026-05-25 R2 | DGX-02 = canonical authority, MacBook = client outbox/cache | 코덱스의 #36 correction |
| 2026-05-25 R2 | Permission/Redaction은 F1~F10 단계별 진입, tmux는 F10 | docs/29 §10 |
| 2026-05-25 R2 | debate engine 실 실행은 evaluator (F2) + budget (F4) + approval flow (F5) 후 진입 | 어댑터 + permission stack 둘 다 받아야 후속 정리 비용 적음 |
| 2026-05-25 R2 | Anthropic prompt caching beta는 default off | reseller cache 지원 불확실, 호출자 명시 시만 활성 |
| 2026-05-25 R2 | Ollama 실 호스팅 결정 보류 | RAM 안전 3룰 통과 후 |
| 2026-05-25 R3 | **F3 desktop approval UX (#44)는 F2 (#42) 위에 sibling stack, F4 (#46)도 sibling** | UX와 server endpoint가 다른 영역이라 stacked sibling이 가장 깔끔. 머지 순서 `#42 → (#44, #46) → #47` |
| 2026-05-25 R3 | **승인 큐는 Event Store에 `approval.requested/granted/rejected` 이벤트로 영속화** (별도 임시 메모리 X) | 모바일/리플레이/감사 로그 모두 같은 원본 — F4 (#46) 구현 결정 |
| 2026-05-25 R3 | **Anthropic prompt caching 활성화 시점은 caller가 결정** (default off 유지) | reseller(APIKey.fun) cache 지원 미검증. PR #43 머지 후 직접 api.anthropic.com부터 smoke 검증 → 검증된 reseller만 단계적 활성 |
| 2026-05-25 R3 | **5 virtual agent SOULs (architect/reviewer/skeptic/verifier/memory_curator)는 페르소나당 SOUL.md + AGENTS.md 페어로 정의** (#48) | orchestrator 패턴 그대로 — voice/판단/산출물은 각자 다르고 안전 경계 (Permission Matrix, secret, DGX-01, untrusted)는 공통 |
| 2026-05-25 R3 | **Streaming은 `completeStreaming?()` 별도 optional method**, transport는 SSE | `complete()`/`Promise` 와 stream/`AsyncIterable`은 try/catch 패턴이 달라 한 메서드 묶으면 caller 자주 틀림. SSE는 단방향/iOS PWA reconnect 네이티브/Cloudflare 검증됨 |
| 2026-05-25 R3 | **MemoryAdapter는 LlmAdapter 패턴 그대로 별도 contract 박음 — `packages/memory/` 신규 워크스페이스** | providers는 LLM 호출, memory는 다른 도메인. trust enforcement / error taxonomy / contract fixtures 섞으면 변경 비용 큼 |
| 2026-05-25 R3 | **DgxSimpleMem `remember()`는 즉시 `promotion_pending` error throw** (intent event만 발행, 실 record는 Curator promotion 후) | caller가 비대칭성을 명시적으로 try/catch로 처리하게 강제 — return type union 대비 호환 부담 작음 |
