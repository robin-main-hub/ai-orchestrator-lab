# Work Board (Claude × Codex 협업 상태)

이 문서는 Claude와 Codex가 같은 repo를 분업할 때 서로의 작업 상태와 합의를 한 페이지로 보기 위한 작업판이다.  
외부 검토자 리뷰 모음은 [`review-board.md`](review-board.md), 어댑터 인터페이스 제안서는 [`24-provider-adapters.md`](24-provider-adapters.md).

마지막 갱신: 2026-05-25.

## 1. 협업 규칙

- **Branch prefix**: `claude/...` (Claude 작업) vs `codex/...` (Codex 작업).
- **Commit trailer**:
  - Claude: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  - Codex: `Co-Authored-By: Codex GPT-5 <noreply@openai.com>` (Codex 측이 설정 적용)
- **PR title prefix**: `[claude] ...` / `[codex] ...`.
- **파일 점유 룰** (동시 작업 금지):
  - Codex가 점유: `apps/desktop/src/App.tsx`, `apps/desktop/src/runtime/**` (압축 진행 중에는 desktop 전반)
  - Claude가 점유: `apps/server/src/index.ts` (C1·C2 작업 중), `packages/agents/src/**`
  - 같은 파일을 만지기 전엔 work-board에 알리고 다른 쪽이 잠시 멈춘다.

## 2. 진행 중인 PR

| Branch | Author | 요약 | 상태 |
|---|---|---|---|
| `claude/fix-server-auth-and-validation` | Claude | C1: CORS whitelist + Bearer auth middleware + `ORCHESTRATOR_API_TOKEN` | Push, PR 대기 |
| `claude/fix-server-input-validation` | Claude | C2: Zod 강제 (/provider-completions, /remote-runs) + 1MB body limit + secret regex 강화 + log redaction | Push (C1 위 stacked), PR 대기 |
| `claude/docs-provider-adapter-interface` | Claude | `docs/24-provider-adapters.md` 신규 — 어댑터 5개 시작 전 인터페이스 제안서 | Push, PR 대기, 결정 7개 회신 대기 |
| `claude/agents-debate-and-packet-safety` | Claude | `packages/agents`에 debate round 상태 전이 + coding packet safety guard + 23개 테스트 | Push, PR 대기 |
| `codex/compress-desktop` (예정) | Codex | `App.tsx` 압축 STEP 4~ (컴포넌트 추출) | 진행 중 |

검증 상태 (모든 Claude 브랜치): `pnpm typecheck` ✅, `pnpm test` ✅ (총 109 tests).

## 3. 분담 합의

### 3.1 단기 (압축 중 ~ 압축 직후)

| 영역 | 담당 |
|---|---|
| `App.tsx` 압축 STEP 4/5 (컴포넌트 추출) | Codex |
| `apps/server/src/index.ts` 보안 패치 C1·C2 | Claude (완료, push됨) |
| `packages/agents` 보안 패치 (round 종료조건, packet 가드) | Claude (완료, push됨) |
| `docs/24` 어댑터 제안서 | Claude (완료, push됨) |
| `docs/work-board.md` (이 문서) | Claude |

### 3.2 어댑터 5개 (압축 완료 후 시작)

순서는 Codex 권장 + Claude 동의: **DGX vLLM → OpenAI-compatible → Anthropic → Ollama → OpenRouter**.

| 어댑터 | 담당 | 근거 |
|---|---|---|
| OpenAI-compatible base + DGX vLLM | Codex | 현재 시운전 축, server 코드 컨텍스트 근접 |
| OpenAI 어댑터 (base 사용) | Codex | base와 90% 공통 |
| OpenRouter 어댑터 (base + extra headers) | Codex 또는 Claude | base 패턴 재사용 |
| Anthropic 어댑터 (별도 wire format) | Claude | system top-level, content array, cache 토큰 처리 |
| Ollama 어댑터 (로컬 only) | Claude | `/api/chat` 줄 단위 응답, auth 없음 |
| `AdapterError` + contract test 골격 | Claude | 모든 어댑터의 공통 기반 |
| Server 마이그레이션 (어댑터 머지 후) | 각 어댑터 작성자가 후속 PR | apps/server의 raw fetch → 어댑터 호출 |

### 3.3 압축 후속

- **C1 후속**: desktop 클라이언트가 모든 DGX 요청에 `Authorization: Bearer ${VITE_ORCHESTRATOR_API_TOKEN}` 부착. 작업 영역이 `App.tsx` / `runtime/**`이라 **Codex가 압축 끝낸 뒤 처리**.
- **C3·C4 (desktop state sync race fix)**: `App.tsx` 압축 STEP 5 끝난 뒤 Claude가 다시 진단 + 패치.
- **C5 (SSOT 통일)**: `packages/providers`의 `ProviderCompletionRequest`를 protocol의 동명 schema로 통일. docs/24 결정 1번(어댑터 위치) 답 받고 어댑터 1번째 PR에 묶어 처리.

## 4. 결정 대기 항목

### 4.1 Codex 회신 대기 — `docs/24` 7개 결정점

1. 신규 `packages/providers/src/adapter.ts` 분리 vs 기존 `index.ts`에 같이 두기?
2. Secret 주입 — `AdapterRuntimeContext.resolveSecret()` 패턴 vs 클로저 캡처?
3. Anthropic `system` 메시지 자동 분리 — 어댑터 책임 OK?
4. Anthropic `max_tokens` 기본값 — 4096 / 8192 / 16384 / contextWindow 기반 동적?
5. OAuth secret refresh — 어댑터 내부 vs 별도 계층?
6. MockProviderAdapter — 재작성 후 기존 삭제 vs alias 유지?
7. Server 마이그레이션 페이스 — 어댑터 5개 일괄 vs 어댑터당 server PR 1개?

### 4.2 사용자/Codex 회신 대기 — 기타

- C1·C2 PR을 main에 머지하는 시점 (압축 1차 끝나기 전 vs 후).
- Vertical slice의 정확한 범위 (Grok 제안: Conversation → DGX proxy → Event sync → Replay → Obsidian export, streaming은 비포함).
- 405 메소드 가드 (server) — 미지 method에 405 + Allow 헤더 추가할지.

## 5. 알려진 위험 / 다음 작업 후보

리뷰에서 잡혔지만 아직 손 안 댄 항목들. 우선순위 순.

| 위험 | 위치 | 담당 후보 | 진입 시점 |
|---|---|---|---|
| Event store 큐 race | `apps/server/src/index.ts:1731` (`enqueueStorageTask`) | Claude or Codex | sqlite/file lock 도입 합의 후 |
| Completion streaming 미구현 | `apps/server/src/index.ts:845` (`supportsStreaming: true` 플래그만) | Codex | 어댑터 5개 머지 후 별도 streaming layer PR |
| `ProviderCompletionUsage` cache 필드 누락 | `packages/protocol` | Claude | C2 머지 + Anthropic 어댑터 작업 시 함께 |
| `EventEnvelope.payload: z.unknown()` discriminated union 부재 | `packages/protocol:567` | Claude | 어댑터 작업 후 별도 PR (침습적) |
| Provider 실제 어댑터 0개 | `packages/providers` | Codex + Claude | 압축 후 즉시 |
| Virtual agent 6개 SOUL 파일 부재 | `agents/orchestrator/SOUL.md`만 존재 | 본인 | vertical slice 검증 후 |
| Tmux dispatch 구현 부재 | `apps/desktop/src/runtime/**`, `scripts/` | Codex | C3·C4 이후 |
| Permission/Redaction engine 미구현 | `apps/server`, `packages/protocol` | Claude | 어댑터 머지 + Vertical slice 후 |

## 6. 압축 일정 (Codex 통지)

- **1차 압축**: leaf/패널 컴포넌트 추출, `App.tsx` 6000줄대 → 4000줄대. 예상 1~2 작업 세션.
- **2차 압축**: `ConversationWorkbench`, `AgentSettingsPanel`, `AgentConfigDrawer`, `DebateTable` 추출. 예상 추가 1~2 세션.
- **Hook 분해 (STEP 5)**: 위험도 높음. "압축 끝"에 묶지 않고, race fix / provider wiring 직전 필요한 hook부터 점진 분리.

압축 영향을 받는 Claude 작업은 **C3·C4 desktop race fix + C1 후속(클라이언트 Bearer 부착)** 두 가지뿐이고, 이 둘은 압축 1차/2차 완료 후로 일정이 잡혀 있다.

## 7. 최근 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-05-25 | 협업 룰 (branch/trailer/PR prefix + 파일 점유) 합의 | 별도 GitHub 계정보다 관리 부담 적고 GitHub UI에서 충분히 식별 가능 |
| 2026-05-25 | C1 → C2 순서로 분리 커밋 | 접속 차단이 CORS인지 body validation인지 추적 가능 |
| 2026-05-25 | 어댑터 순서 vLLM → OpenAI → Anthropic → Ollama → OpenRouter | 실제 시운전 축 + OpenAI-compatible 골격 재사용 |
| 2026-05-25 | 어댑터 1차에 streaming/tool use 비포함 | 5개 어댑터가 buffered로 다 동작한 뒤 별도 streaming layer PR |
| 2026-05-25 | C3·C4 desktop race fix는 압축 STEP 5 끝난 뒤 | 압축 중에는 App 경계가 계속 움직여 진단 무의미 |
| 2026-05-25 | C1 클라이언트 측 Bearer 부착은 압축 후 Codex가 처리 | 작업 영역이 압축 대상과 겹침 |
