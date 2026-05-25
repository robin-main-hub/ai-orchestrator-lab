# Work Board (Claude × Codex 협업 상태)

Claude와 Codex가 같은 repo를 분업할 때 서로의 작업 상태와 합의를 한 페이지로 보기 위한 작업판.

관련 문서: [`review-board.md`](review-board.md) (외부 검토자 리뷰), [`24-provider-adapters.md`](24-provider-adapters.md) (어댑터 인터페이스 + post-merge status), [`29-permission-engine-spec.md`](29-permission-engine-spec.md) (Permission/Redaction spec), [`30-security-audit-checklist.md`](30-security-audit-checklist.md) (보안 감사).

마지막 갱신: 2026-05-25 라운드 2 (어댑터 5종 + permission spec + security checklist 완료 시점).

## 1. 협업 규칙

- **Branch prefix**: `claude/...` (Claude 작업) vs `codex/...` (Codex 작업).
- **Commit trailer**:
  - Claude: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  - Codex: `Co-Authored-By: Codex GPT-5 <noreply@openai.com>`
- **PR title prefix**: `[claude] ...` / `[codex] ...`.
- **파일 점유 룰** (동시 작업 금지):
  - Codex 영역: `apps/desktop/**`, `apps/mobile/**`, `apps/server/src/index.ts` (legacy cleanup + permission F1~F3 진입 후), `packages/providers/src/openAiCompatibleAdapter.ts`, `packages/providers/src/node/codexCliOAuthAdapter.ts`, README + docs authority 문서 + Stage6 seed
  - Claude 영역: `packages/providers/src/anthropicAdapter.ts`, `packages/providers/src/ollamaAdapter.ts`, `packages/providers/src/contractTestFixtures.ts`, `packages/agents/src/**`, `docs/24~30` 신규
  - 양쪽 다 신중히: `packages/protocol/src/index.ts` (Claude는 신규 schema 추가만, Codex가 permission 타입 변경 중일 때는 Claude 0 touch)
  - 같은 파일을 만지기 전엔 work-board에 알리고 다른 쪽이 잠시 멈춘다.

## 2. 머지된 작업 (최근 라운드)

### 보안 / 인증 / 배포
- ✅ **#9 C1** — server Bearer auth + CORS whitelist (5174 포함) + ORCHESTRATOR_API_TOKEN
- ✅ **#10 C2** — Zod validation + 1MB body limit + secret redact
- ✅ **#17 desktop bearer wiring** + 모바일 압축
- ✅ **#19 stage32DgxRouteDiagnostics** — base URL별 분리 진단
- ✅ **#20 large body 413 hotfix**
- ✅ **#26 mobile polish** (탭바 + 첨부 cap)
- ✅ **#27 agents lifecycle safety fix** (코덱스 — pending round race 차단)
- ✅ **#28 DGX vLLM 모델 id 갱신** (qwen36-gio-lora-v5-prisma)

### 어댑터 인프라 (5종 완성)
- ✅ **#18 PR α** — `LlmAdapter` interface + `AdapterRuntimeContext` + `AdapterError` (9 categories) + `MockLlmAdapter`
- ✅ **#21 Codex OAuth main provider** + **#22 ESM runtime fix**
- ✅ **#24 OpenAI-compatible adapter** (DGX vLLM, DeepSeek, APIKey.fun Codex/GPT, Grok proxy, OR/OpenAI 통합)
- ✅ **#25 smoke script Codex OAuth 기본**
- ✅ **#29 Anthropic adapter** (β) + server migration
- ✅ **#30 server legacy helpers cleanup**

### 문서 / mobile / agents
- ✅ **#11~#16, #23** — Claude PR 7개 일괄 머지 (agents safety, work-board v1, docs/24~27, mobile PWA)
- ✅ **#32 docs/seed authority correction** (코덱스 — DGX-02 authority 표기 정정)

총 머지 카운트 (이번 라운드): 약 25개 PR (Claude + Codex 합산).

## 3. 진행 중 (open PR)

| PR | Author | 요약 | 상태 |
|---|---|---|---|
| [#31](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/31) | Claude | Ollama adapter (γ) — 로컬 only, 21 tests | MERGEABLE |
| [#33](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/33) | Claude | Contract test fixtures + OpenAI-compatible + Anthropic 적용 (93 tests) | MERGEABLE |
| [#34](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/34) | Claude | docs/24·25·26 implementation status sync | MERGEABLE |
| [#35](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/35) | Claude | docs/29 Permission engine spec (F1~F10 로드맵) | MERGEABLE |
| [#36](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/36) | Codex | (별도 작업 — Claude 미상세) | open |
| [#37](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/37) | Claude | docs/30 Security audit checklist | MERGEABLE |
| [#38](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/38) | Codex | #36 위 stacked | open |

검증 상태 (모든 Claude PR): `pnpm typecheck` ✅, `pnpm test` ✅ (총 ~200 tests).

## 4. 다음 작업 우선순위

### 진행 중인 코덱스 작업
- **F1~F3 Permission/Redaction 공통 관문 구현** — docs/29 spec 기반. evaluator (provider_call / remote_run / mobile / reboot / future tmux dispatch 공통 decision). 코덱스 영역, Claude 0 touch.
- 머지 라운드 정리 (위 7 PR + 본 work-board 갱신 PR)

### Claude 다음 진입 (코덱스 작업 종료 + 머지 라운드 정리 후)
1. **agents — debate engine 실 실행 (LlmAdapter + evaluator 받기)** — packages/agents 영역. evaluator가 main에 있어야 호출 가능. 2~3시간.
2. **Anthropic prompt caching beta** — `betaHeaders: ["prompt-caching-2024-07-31"]` 옵션 정식 활용 + content cache_control 패턴. 1시간.
3. **Ollama contract test 적용** — #31 머지 후 즉시. 30분.
4. **OpenRouter adapter** (Codex 영역이라 Claude는 안 함, OR Codex가 양보하면 패턴 동일)

### 잠금 해제 의존
- debate engine ← evaluator + 5 PR 머지
- ERP 도메인 entries (`payment_action` 등) ← F1~F10 다 머지 + 보안 감사 통과
- 모바일 승인 큐 UI ← F4 (`/approvals/*` server endpoint)
- Multi-channel ingress (telegram, mobile webhook) ← F9
- tmux dispatch ← F10 (F1~F9 다 통과)

## 5. 결정 대기

### docs/29 6개 결정 (codex/user 회신 대기)
1. 정책 매트릭스 위치 — hardcoded TS vs JSON vs DB row
2. approval TTL 기본값
3. 2FA 메커니즘 — 모바일 push + 코드 vs telegram bot inline button
4. PermissionMatrixItem 영속화 — Event Storage vs 별도 audit log
5. untrusted source memory recall — 차단 vs summary only
6. Redaction 위반 처리 — 자동 치환 vs 거부 (scope 별)

### 기타
- Anthropic prompt caching beta 활성화 시점 (cost-vs-quality trade-off)
- Ollama 실 호스팅 위치 — DGX-02 (RAM 룰 통과) vs desktop-local
- OpenRouter adapter 담당자 (Codex base 재사용 vs Claude 별도)

## 6. 알려진 위험 (요약)

상세는 [`docs/30-security-audit-checklist.md`](30-security-audit-checklist.md) §7 (Known-pending risk register).

| 위험 | 등급 | 닫힐 시점 |
|---|---|---|
| Permission/Approval enforcement (typed only) | High | F1~F3 (codex 진행 중) |
| Redaction pipeline 5 stage 중 3,4,5 미구현 | Medium | F7 |
| Ingress receiver (telegram/mobile webhook) 0 구현 | Medium | F9 |
| Audit log 영속화 | High | F3 |
| 2FA (device_reboot, secret_view, payment) | High | F4~F5 |
| Backup/Export redaction (pre_backup) | High | F7 |
| Server rate limit 부재 | Low (지금) → High (외부 사용자 증가 시) | 별도 PR |
| Provider OAuth refresh layer | Medium | F4 또는 별도 |
| ERP-도메인 actions 정책 미정 | High (ERP 진입 시) | ERP 진입 직전 |

## 7. 분담 안 한 작업 (양쪽 다 안 잡음)

- streaming layer (`stream: true` 어댑터 통합) — 어댑터 5종 buffered 검증 후
- Tool use / function call — Anthropic / OpenAI 명세 차이 어댑터 통합 후
- Multimodal (image / document) — ModelDescriptor에 flag만, 어댑터 미구현
- Memento MCP 실연동 — RecallQuery type만, MCP adapter 0
- Coding Packet 실행 게이트 — packet 검증은 있고 실 실행 0
- Virtual agent 5개 SOUL 파일 (architect/reviewer/skeptic/verifier/memory_curator) — orchestrator SOUL만 존재
- Obsidian/Notion 실 file writer — projection 타입만, fs/API 호출 0

## 8. 최근 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-05-25 R1 | 협업 룰 (branch/trailer/PR prefix + 파일 점유) | 별도 GitHub 계정보다 관리 부담 작음 |
| 2026-05-25 R1 | C1 → C2 순서로 분리 커밋 | 접속 차단이 CORS인지 body validation인지 추적 가능 |
| 2026-05-25 R1 | 어댑터 순서 vLLM → OpenAI → Anthropic → Ollama → OpenRouter | 실제 시운전 축 + OpenAI-compatible 골격 재사용 |
| 2026-05-25 R1 | 어댑터 1차에 streaming/tool use 비포함 | 5개 buffered 검증 후 별도 PR |
| 2026-05-25 R1 | C1 클라이언트 측 Bearer 부착은 코덱스가 압축 후 처리 | 작업 영역 겹침 |
| 2026-05-25 R1 | Codex OAuth를 메인 provider로 채택 | 빠른 응답, dense qwen은 RAG/문서/오프라인용 폴백 |
| 2026-05-25 R1 | Codex OAuth는 CLI subprocess (A안) | `codex serve` 부재로 C안 불가, B안은 약관 risk |
| 2026-05-25 R1 | Cloudflare Tunnel로 endruin.com 외부 노출 | DNS DGX-02 직접 노출보다 NAT/TLS/IP 변경 자동 |
| 2026-05-25 R2 | Anthropic adapter는 `x-api-key` 사용 | 기존 raw fetch의 `Authorization: Bearer` 잘못. AnthropicAdapter가 정확 |
| 2026-05-25 R2 | `ProviderCompletionUsage`에 cache 필드 추가 | Anthropic prompt caching usage 정확 보고 |
| 2026-05-25 R2 | server anthropic_messages도 `createAnthropicServerCompletion()` 어댑터 통과 | OpenAI-compatible과 대칭 + raw fetch dead code 제거 |
| 2026-05-25 R2 | DGX-02 = canonical authority, MacBook = client outbox/cache | 코덱스의 #36 correction. 런타임 코드는 이미 `dgx02_authority_wins` |
| 2026-05-25 R2 | Permission/Redaction은 F1~F10 단계별 진입, tmux는 F10 | docs/29 §10. 모든 보호 대상 동작이 같은 8단계 흐름 통과 |
| 2026-05-25 R2 | debate engine 실 실행은 evaluator (F2) 이후 진입 | 어댑터 + evaluator 둘 다 받아야 후속 정리 비용 적음 |
| 2026-05-25 R2 | Anthropic prompt caching beta는 default off | reseller (APIKey.fun) cache 지원 불확실, 호출자 명시 시만 활성 |
| 2026-05-25 R2 | Ollama 실 호스팅 결정 보류 | RAM 안전 3룰 (노드당 vLLM 1, RAM <100GiB 보류, 사용자 confirm) 통과 후 |
