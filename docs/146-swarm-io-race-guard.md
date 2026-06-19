# P0 Swarm IO Race Guard / Stale Capture Hardening

> **상태**: 구현 완료 - PR #666 (code/tests, merge commit `7cb44d8`) - swarm IO safety pass
> **목표**: tmux swarm send/capture가 stale pane이나 stale capture를 조용히 성공처럼 보지 않도록, local script boundary에서 lock/session/pane/marker 검증을 강화한다.

## 한 줄 요약
Swarm IO now has a local race guard: send/capture/setup share a portable lock, validate session/pane identity, and support freshness markers. Agent behavior와 runner/server lifecycle은 바꾸지 않았다.

## 무엇이 바뀌었나
- Shared script guard:
  - `scripts/swarm-io-common.sh`를 추가해 공통 failure, mkdir lock, env/session validation, live pane validation, marker metadata, output redaction을 모았다.
  - lock은 `${AI_SWARM_STATE_DIR:-.ai-swarm}/locks/swarm.lock` 아래 portable `mkdir` 방식이다.
- Setup guard:
  - `scripts/setup-agent-swarm.sh`가 tmux 존재 확인과 lock 획득을 공통 helper로 수행한다.
  - 기존 `--reset` cleanup 경로 외 destructive tmux kill 동작은 추가하지 않았다.
- Send guard:
  - `scripts/swarm-send.sh`가 send 전에 env file session, live tmux session, live pane id/session ownership을 검증한다.
  - 기본으로 non-secret `AI_SWARM_MARKER` line을 pane에 전송하고, command text 없이 marker/session/role/pane/time metadata만 저장한다.
  - `--no-marker`로 marker 전송을 끌 수 있다.
- Capture guard:
  - `scripts/swarm-capture.sh`가 capture 전에 같은 session/pane identity를 검증한다.
  - `--require-marker MARKER`는 marker가 없으면 stale/missing으로 실패한다.
  - `--since-marker MARKER`는 marker 이후 출력만 보여주며, marker 값 누락은 즉시 실패한다.
- Test harness:
  - `scripts/test-swarm-io-hardening.sh` fake tmux test harness와 `pnpm swarm:test`를 추가했다.
  - real tmux를 건드리지 않고 session mismatch, stale pane, lock busy, marker metadata, marker freshness, secret refusal, concurrent send metadata를 검증한다.

## 안전 불변식
```text
local scripts only
agent behavior rewrite 0
runner dispatch 0 - server write 0 - EventStorage append 0 - DB migration 0
no new hidden job - no external send path beyond existing tmux send helper
no destructive tmux kill outside existing setup --reset path
marker metadata stores no command text and no secrets
generic only
```

## 코드 표면
- PR #666, merge commit `7cb44d8`
  - `scripts/swarm-io-common.sh`
  - `scripts/setup-agent-swarm.sh`
  - `scripts/swarm-send.sh`
  - `scripts/swarm-capture.sh`
  - `scripts/test-swarm-io-hardening.sh`
  - `package.json` (`swarm:test`)

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| E1 | deferred | app-level source에는 정직한 diff stats가 없어 fake row를 만들지 않음. |
| E2 | done | Runner Theater는 read-only LIVE surface. |
| E3 | done | Learning & Memory Console은 read-only roll-up. |
| E4A | done | Evidence Draft LIVE input seam. Producer 없음. |
| E5 | done | WorkItem Candidate seed. Candidate-only central axis. |
| E6 | done | WorkItem Candidate detail drawer + ref-only link graph. |
| E7 | done | WorkItem Candidate local triage board + filters/search/jump. |
| E8 | done | WorkItem Candidate / Evidence Draft read-only ref cross-link. |
| E9 | done | WorkItem Candidate read-only next-step preview. |
| E10 | done | WorkItem Candidate read-only readiness/confidence meter. |
| E11 | done | WorkItem Candidate read-only operations room: projection, board, detail map, local controls. |
| E12 | done | WorkItem Candidate read-only source trace timeline. |
| E13 | done | WorkItem Candidate component/helper consolidation. |
| E14 | done | WorkItem Candidate read-only signal chips and detail signal summary. |
| E15 | done | WorkItem Candidate read-only operator review surface and local review filters. |
| E16 | done | WorkItem Candidate / Runner Theater read-only signal linkage. |
| E17 | done | WorkItem Candidate / Patch Candidate read-only signal linkage. |
| E18 | done | WorkItem Candidate / Learning-Memory read-only aggregate signal linkage. |
| E19 | done | WorkItem Candidate cross-surface local signal filters and command jumps. |
| P0 | done | Swarm IO race guard / stale capture hardening. Local scripts only; no agent behavior rewrite. |
| P1 | done | Permission/redaction boundary simulation. Production-like example tokens rejected; EventStorage and local outbox redact secret-like payloads before durable/sync exposure. |

## 검증
- Local:
  - `pnpm swarm:test` - pass.
  - `bash -n scripts/setup-agent-swarm.sh scripts/swarm-send.sh scripts/swarm-capture.sh scripts/swarm-io-common.sh scripts/test-swarm-io-hardening.sh` - pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `pnpm --filter @ai-orchestrator/mcp test` - 18 tests pass.
  - `pnpm test` - pass. 기존 `--localstorage-file` 경고만 출력.
  - `git diff --check` - pass.
- CI:
  - `build + test` initially hit an unrelated `VisualQaCard.test.tsx` single-test failure; rerun passed.
  - `secret scan + dependency audit` - pass.
  - Vercel remained externally failed due to deployment rate limit.
- `shellcheck` was not available in the local environment.

## 완료 문구 (과장 금지)
Swarm IO now has a local race guard for send/capture freshness and stale pane validation. Agent behavior, runner dispatch, server writes, and EventStorage writes were not changed.
