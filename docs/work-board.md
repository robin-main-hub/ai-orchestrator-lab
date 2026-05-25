# Work Board (Claude × Codex 협업 상태)

Claude와 Codex가 같은 repo를 분업할 때 서로의 작업 상태와 합의를 한 페이지로 보기 위한 작업판.

관련 문서: [`review-board.md`](review-board.md) (외부 검토자 리뷰), [`24-provider-adapters.md`](24-provider-adapters.md) (LlmAdapter), [`29-permission-engine-spec.md`](29-permission-engine-spec.md) (Permission/Redaction), [`30-security-audit-checklist.md`](30-security-audit-checklist.md) (보안 감사), [`31-streaming-layer-spec.md`](31-streaming-layer-spec.md) (streaming v1), [`32-memory-adapter-spec.md`](32-memory-adapter-spec.md) (MemoryAdapter contract).

마지막 갱신: 2026-05-25 라운드 **3.1** (R3 위 amend — Codex F6~F9가 PR로 추가됨 + Claude `#54/#56/#58` 평행 stack. F10 (tmux dispatch gate)은 Codex에서 진행 중, PR 아직 없음).

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

## 3. 진행 중 (open PR — 16건)

### Codex permission stack (F2~F9, stacked tree)

```
main
 └── #42 (F2 server permission gate)
      ├── #44 (F3 desktop approval UX)
      └── #46 (F4 server /approvals/*)
           ├── #47 (F5 mobile approval queue)
           ├── #49 (F7 server redaction pipeline)
           │    └── #55 (F9 ingress receiver)
           ├── #51 (F6 desktop approval drawer)
           └── #52 (F8 provider budget guard)
```

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#42](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/42) | `main` | F2 server permission gate — `/provider-completions` + `/remote-runs`에 evaluator 통합 | MERGEABLE |
| [#44](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/44) | `#42` | F3 desktop approval UX (sibling of #46) — 채팅 안 승인 패널 + composer 복원 retry | MERGEABLE |
| [#46](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/46) | `#42` | F4 server `/approvals/list,grant,reject` endpoints + Event Store 기록 | MERGEABLE |
| [#47](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/47) | `#46` | F5 mobile approval queue — 폰에서 승인/거절 + 처리 내역 | MERGEABLE |
| [#49](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/49) | `#46` | F7 server redaction pipeline — provider 호출 직전/응답 직후 + Event Store 경로 redaction | MERGEABLE |
| [#51](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/51) | `#46` | F6 desktop approval drawer — 상단 버튼 + 우측 drawer, 터미널 inline approve/reject 보존 | MERGEABLE |
| [#52](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/52) | `#46` | F8 provider budget guard — 입력 토큰 추정 + 임계값별 승인 대기/거부, approval에 `costEstimateTokens` 포함 | MERGEABLE |
| [#55](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/55) | `#49` | F9 ingress receiver — 외부 입력 raw 격리 + redacted normalized event + approval request만 Event Store 진입 | MERGEABLE |

머지 순서: **`#42 → (#44, #46) → (#47, #49, #51, #52) → #55`**. `#46` 위 4 sibling은 서로 독립이라 어느 쪽 먼저든 OK. `#55`는 `#49` 위 stacked.

**F10 (tmux dispatch gate)** — Codex에서 구현 중, 아직 PR 미공개. 베이스는 `#55` 위에 stacked 예상.

### Claude solo PR (6건, 독립)

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#41](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/41) | `main` | Ollama adapter contract test 적용 (120 tests) | MERGEABLE |
| [#43](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/43) | `main` | Anthropic prompt caching opt-in (`enablePromptCaching` + `cacheStrategy`, 130 tests) | MERGEABLE |
| [#45](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/45) | `main` | docs/31 streaming layer spec (4 어댑터 → token-by-token 설계 합의, 9 결정점) | MERGEABLE |
| [#48](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/48) | `main` | 5 virtual agent SOULs (architect / reviewer / skeptic / verifier / memory_curator) | MERGEABLE |
| [#50](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/50) | `main` | docs/32 memory adapter spec (`MemoryAdapter` contract, 11 결정점) | MERGEABLE |
| [#58](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/58) | `main` | OpenRouter adapter — `createOpenRouterAdapter()` factory wrap of OpenAI-compat (139 tests) | MERGEABLE |

### Claude stack (2건, debate engine 사전 작업)

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#54](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/54) | `main` | `packages/agents` persona markdown loader + `defaultAgentProfiles` 7개 정합 (58 tests) | MERGEABLE |
| [#56](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/56) | `#54` | 페르소나 시각 정체성 — `avatar.svg` placeholder 6개 + `chatBackgroundPath` 폴백, 데스크톱 swarm + 모바일 메시지 + 모바일 채팅 배경이 한 출처 (72 tests) | MERGEABLE |

총 16건 모두 MERGEABLE.

검증 상태: 모든 PR에 `pnpm typecheck` + `pnpm test` 통과. providers 120~139 tests, agents 58~72, server 27~36 (F7/F8/F9 추가 반영).

## 4. 다음 작업 우선순위

### Codex 다음 진입

- **F10 tmux dispatch gate** — 진행 중, PR 미공개. `#55` 위 stacked 예상. 명령 의도 기록 → 권한 평가 → approval queue → 승인 후만 send-keys 통과
- (R3.1 시점 기준) **F2~F9 다 PR로 떴음** — 머지 라운드 진행 중. evaluator 정책 매트릭스 (docs/29 §5 결정 1), 2FA, ERP 도메인 정책은 별도 후속

### Claude 다음 진입

순서 의존:

1. **debate engine 실 실행** — `packages/agents`. F2 evaluator + F4 budget guard + F5 approval flow가 main에 있어야 호출 가능. 머지 라운드 끝나면 즉시 진입. 2~3시간. evaluator + 5 어댑터 + 5 SOULs (#48) + persona loader (#54) + avatars (#56) 다 받아서 자연스럽게 조립.
2. **M1 memory workspace** (docs/32 결정 회신 후) — `packages/memory/` 워크스페이스 + `MemoryAdapter` 인터페이스 + `MockMemoryAdapter` + 6 contract fixtures. 의존 0. 1~2시간.
3. **streaming P1** (docs/31 결정 회신 후) — protocol에 `ProviderCompletionChunkEvent` 추가 + `MockLlmAdapter.completeStreaming()` + 5 streaming contract fixtures. **단, protocol 추가는 Codex permission 작업 끝난 뒤**. 1시간.
4. ~~OpenRouter adapter~~ — ✅ **PR #58로 닫힘** (factory wrap, 25 new tests).

### 잠금 해제 의존 표

| 작업 | 잠금 해제 조건 |
|---|---|
| debate engine 실 실행 | F2 + F4 + F5 머지 (다 PR로 떴음, 머지 대기) + #48/#54/#56 머지 |
| M1 memory adapter workspace | docs/32 결정 회신 (M1 자체는 의존 0) |
| streaming P1 | docs/31 결정 회신 + Codex F10 머지 후 protocol 정착 |
| ERP 도메인 entries (`payment_action` 등) | F1~F10 다 머지 + 보안 감사 통과 |
| Multi-channel ingress (telegram, mobile webhook) | F9 머지 (#55) |
| tmux dispatch | F10 머지 |
| 모바일 승인 큐 UI 추가 기능 | F5 머지 (#47) |

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
- ~~OpenRouter adapter 담당~~ — ✅ **Claude factory wrap (#58)으로 닫힘**. Codex가 별도 풀-스크래치 OpenRouter 어댑터 만들 필요 없음
- 페르소나 placeholder SVG vs 실인물 사진 — `agents/<persona>/avatar.svg` placeholder (#56) 적용 됨. 사용자가 실인물 portrait 으로 교체할 시점 (drop-in 으로 자동 교체)
- F10 머지 후 tmux 실 dispatch 활성화 시점 — F1~F10 다 main 정착 + 보안 감사 통과 후

## 6. 알려진 위험 (요약)

상세는 [`docs/30-security-audit-checklist.md`](30-security-audit-checklist.md) §7.

| 위험 | 등급 | 닫힐 시점 |
|---|---|---|
| Permission/Approval enforcement (typed only) | High → **PR 완성, 머지 대기** | F1~F5 PR (#42/#44/#46/#47) 머지 시 |
| Redaction pipeline 5 stage 중 3,4,5 미구현 | Medium → **PR 완성, 머지 대기** | F7 (#49) 머지 시 |
| Ingress receiver 0 구현 | Medium → **PR 완성, 머지 대기** | F9 (#55) 머지 시 |
| Audit log 영속화 | High → **부분 진행 (PR 완성)** | F4 (#46) 머지 + 후속 F8 schema 확장 |
| 2FA (device_reboot, secret_view, payment) | High | F4~F5 (#46/#47) 머지 + 결정 3 (telegram bot vs mobile push) |
| Backup/Export redaction (pre_backup) | High → **부분 진행** | F7 (#49)는 prompt_inject + pre_persist 만; pre_backup은 별도 |
| Server rate limit 부재 | Low (지금) → High (외부 사용자 증가 시) | 별도 PR |
| Provider OAuth refresh layer | Medium | F4 또는 별도 |
| Provider 비용/예산 폭주 | Medium → **PR 완성, 머지 대기** | F8 (#52) 머지 시 입력 토큰 추정 + 임계값 가드 |
| tmux dispatch 직접 실행 | High (tmux 진입 시) | F10 (Codex 구현 중) 머지 + 보안 감사 |
| ERP-도메인 actions 정책 미정 | High (ERP 진입 시) | ERP 진입 직전 |
| **Streaming layer 부재** (모든 응답 buffered) | Medium (UX) | docs/31 결정 회신 → P1~P7 |
| **Memory backend 0** (LocalHeuristic 폴백만) | Medium (장기 기억 0) | docs/32 결정 회신 → M1~M6 |

## 7. 분담 안 한 작업 (양쪽 다 안 잡음)

R2 대비 정리됨:

- ~~Virtual agent 5개 SOUL 파일~~ — ✅ **PR #48로 닫힘**
- ~~페르소나 visual identity (avatar + 채팅 배경 폴백)~~ — ✅ **PR #56으로 닫힘**
- ~~persona markdown loader~~ — ✅ **PR #54로 닫힘**
- ~~Memento MCP 실연동 spec~~ — ✅ **PR #50으로 spec 닫힘**, 구현(M1~M6)은 결정 회신 후 진입
- ~~streaming layer (`stream: true` 어댑터 통합) spec~~ — ✅ **PR #45로 spec 닫힘**, 구현(P1~P10)은 결정 회신 후
- ~~OpenRouter adapter~~ — ✅ **PR #58로 닫힘** (factory wrap)

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
| 2026-05-25 **R3.1** | **F6/F7/F8/F9를 `#46` (F4) 위 sibling stack으로 평행 배치** | F6 데스크톱 UI, F7 server redaction, F8 budget guard, F9 ingress receiver가 서로 다른 layer라 sibling으로 두면 리뷰가 깨끗하고 머지 순서 부담 작음. F10만 #55 위 stacked (ingress + tmux가 같은 외부-입력 축) |
| 2026-05-25 **R3.1** | **F7 redaction은 prompt_inject + pre_persist 만 v1, pre_backup은 별도 PR** | 5-stage 중 2개부터 실 동작 검증 후 stage 3~5 확장 — 한꺼번에 5단계 다 짜면 false positive 디버깅 비용 큼. usage 숫자(`totalTokens` 등) false positive는 R3.1에서 패턴 좁혀 해결됨 |
| 2026-05-25 **R3.1** | **F8 provider budget guard는 입력 토큰 추정 + 임계값 2단** (승인 대기 / 거부) | trusted provider라도 large prompt는 비용 폭주 위험 — 사전 추정으로 막음. `costEstimateTokens`를 approval payload에 실어 UI가 나중에 USD 환산 표시 가능 |
| 2026-05-25 **R3.1** | **F9 ingress는 외부 raw 격리 + redacted normalized event만 Event Store 진입** | telegram/mobile webhook이 직접 실행에 도달 안 함 — server에서 guard 결과와 approval request만 기록. 외부 입력 → 자동 실행 경로 0 |
| 2026-05-25 **R3.1** | **OpenRouter는 factory wrap of OpenAI-compat** (별도 풀-스크래치 어댑터 X) | wire shape 동일이라 `headers` / `extraBody` / `kind` 옵션으로 OpenRouter 특화(`HTTP-Referer`, `X-Title`, `transforms`, `route`)만 주입. OpenAI 어댑터 미래 개선이 자동 적용됨 |
| 2026-05-25 **R3.1** | **페르소나 visual identity 는 `agents/<name>/avatar.svg` convention** (SOUL.md 와 sibling) | 데스크톱 swarm 썸네일 + 모바일 메시지 아바타 + 모바일 채팅 배경 폴백 셋이 같은 출처 본다 — placeholder SVG 옆에 `avatar.png` drop-in 으로 자동 교체. 사람이 일하는 느낌 / 몰입감 |
| 2026-05-25 **R3.1** | **`PersonaFileSource` 인터페이스로 fs-agnostic** (`node:fs` 는 `src/node/` 에만) | desktop renderer Vite bundle / 모바일 PWA / 테스트 in-memory 셋 다 같은 loader 쓸 수 있게 — `node:fs` 브라우저 번들 누출 방지 |
