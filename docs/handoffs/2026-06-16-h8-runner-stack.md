# 2026-06-16 AI Orchestrator Lab — H8 Coding Runner 스택 (PR #523~#526)

## 한 줄 요약

`#521`에서 정의한 `CodingRunner` 인터페이스 뒤에 **실제 runner 3종**을 끼웠다 — local shell(H8a) → OpenCode adapter(H8b) → patch/diff handoff(H8c). OpenCode 통째 이식이 아니라 **같은 인터페이스에 implementation을 더한 것**. 모든 단계가 동일한 안전 불변선을 따른다: 변경은 *제안*만, 적용·커밋·PR은 사람 승인 후 별도 단계, 미관측 run은 정직하게 `observed:false`.

## 최종 main 상태

```
a6af13b  feat(app-builder): H8c — runner output → patch/diff handoff (approval-gated) (#526)
de219fb  feat(app-builder): H8b — OpenCode adapter behind the CodingRunner interface (read-only) (#525)
d808a69  test(runner): assemble fake token at runtime to clear gitleaks false positive (#524)
eefaae6  feat(app-builder): H8a — real local shell runner behind the CodingRunner interface (#523)
```

main CI green (build + test / secret scan + dependency audit 둘 다 success). desktop **1788 통과** · typecheck 0 · build green.

## 안전 불변선 (세 단계 공통)

- runner는 변경 **제안**(`changedFiles` + `diffSummary`)만 낸다. 디스크/원격 자동 변경 0.
- 자동 GitHub write / PR / commit **0**.
- `observed=true`는 **실제 실행을 관측했을 때만**. mock·게이트 off·미설치는 `observed:false` + 사유(가짜 성공 금지).
- preset/읽기전용 강제 — arbitrary shell·변경 도구는 어댑터 레벨에서 필터.
- 로그 시크릿 마스킹(`redactSecrets`) 모든 runner 공유.
- 순수 코어 + 주입 effect(ShellExecutor / OpenCodeExecutor) → 헤드리스 테스트.

## PR 트랙 (모두 main merged)

### PR #523 — H8a local shell runner
- branch: `claude/h8a-local-shell-runner` → main / merge `eefaae6`
- `lib/localShellRunner.ts` — `createLocalShellCodingRunner({execute, presets, now, redact})`
  - **preset 진단 명령만**: `git status --short` / `git diff --stat && diff`(읽기전용) / `pnpm typecheck` / `pnpm test --run` / `pnpm build`. 기본 시퀀스 `status → diff → typecheck`. 디스크 안 바꿈.
  - `redactSecrets`(Bearer/sk-/gh*_/`*TOKEN|KEY|SECRET|PASSWORD=`), `parseDiffStat`, `parseTestResult`, AbortController stop.
- `lib/serverShellExecutor.ts` — 실행 effect. dgx-02 게이트(dispatch→승인→send-keys)로 보내고 pane capture. 게이트 off면 `observed:false` + 사유.
- `components/appbuild/CodingRunnerCard.tsx` — mock/local 토글.

### PR #524 — gitleaks 오탐 핫픽스
- merge `d808a69`. secret-redaction 테스트의 리터럴 `sk-live-…`가 gitleaks generic-api-key를 trip → 런타임 조립 토큰(`["sk","live",…].join("-")`)으로 치환. 기능 변화 0.

### PR #525 — H8b OpenCode adapter
- branch: `claude/h8b-opencode-adapter` → main / merge `de219fb`
- `lib/openCodeRunner.ts` — `opencode run --format json --dir <repoRoot> --model <p/m> --allowedTools <…> <prompt>` argv 빌드 + 이벤트 환원.
  - **읽기전용 강제** — `safeOpenCodeTools`가 read/grep/glob/list/webfetch만 통과, write/edit/bash 제거. `file_edit`는 *제안*으로만(자동 적용 0). `--dangerously-skip-permissions` 절대 안 붙임.
  - `parseOpenCodeJsonStream` — `--format json` pane 출력을 관용 파싱(스키마 변동·비-JSON 줄 방어).
- `lib/serverOpenCodeExecutor.ts` — serverShellExecutor와 동형 게이트 effect.
- 카드 토글에 `opencode` 추가 (mock/local/opencode).

### PR #526 — H8c patch/diff handoff
- branch: `claude/h8c-patch-handoff` → main / merge `a6af13b`
- `lib/runnerPatchHandoff.ts` — `buildRunnerPatchHandoff(result, ctx)` → 적용 가능한 구조화 patch handoff.
  - `requiresApproval: true` **고정** — 타입상 자동 적용 경로 없음.
  - 실체 없는 run은 안 넘김 — 미관측/미완료/무변경/빈 diff → `applicable:false` + `blockers`. 테스트 실패는 하드 블록 아님 → `warning`.
  - `parseUnifiedDiffFiles` — diff를 파일 경로별 조각으로(git/plain 양식). `id`는 `result.endedAt`로 결정론적.
- 카드: `onHandoff` 콜백 + "승인 큐로" 버튼(applicable 아니면 비활성 + 사유).

## 인터페이스 형태 (참고)

```
CodingRunner { id, label, observes, run(request, hooks) → { stop, done } }
  ├─ createMockCodingRunner       (#521, observes=false)
  ├─ createLocalShellCodingRunner (#523, preset 진단)
  └─ createOpenCodeRunner         (#525, 읽기전용 opencode)

CodingRunResult → buildRunnerPatchHandoff → RunnerPatchHandoff (#526)
  → onHandoff(handoff) → [승인 단계 / control queue]  ← 적용·커밋·PR은 여기서
```

## 다음 후보 (열린 채로 둠)

- **실행 게이트**: dgx-02 `ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1`은 여전히 OFF. 켜야 local/opencode runner가 *실제* 실행(현재는 정직하게 `observed:false`). 운영 결정 필요.
- **승인 단계 wiring**: `onHandoff` → control queue 실제 연결(현재는 콜백까지). 적용 실행기는 아직 없음(의도 — 자동 적용 금지선).
- opencode `--format json` 실제 스키마 확정(파서는 관용적으로 방어 중).
