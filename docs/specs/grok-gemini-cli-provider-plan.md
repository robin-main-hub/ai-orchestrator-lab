# Grok & Gemini CLI Provider Implementation Plan

## 1. Background

현재 프로젝트에는 이미 `CodexCliOAuthAdapter`라는 실제 CLI 기반 어댑터가 존재한다.
이 어댑터는 `grok -p`, `gemini -p` 같은 로컬 CLI를 subprocess로 호출하는 방식의 좋은 선례를 제공한다.

이번 작업의 목적은 `grok -p`와 `gemini -p`를 위한 전용 어댑터를 안전하고 일관된 방식으로 도입하는 것이다.

## 2. Design Principles (강제)

- `trustLevel` 기본값은 **`limited`**
- `trusted`는 **명시적 opt-in**만 허용
- Subprocess 실행은 `spawn` (또는 `execFile`) + `shell: false` 필수
- Prompt 전달은 **stdin** 방식만 허용 (command argument로 prompt 전달 금지)
- stderr는 **원문 저장 금지**
- Redaction은 **adapter 내부 1차 + 상위 레이어 2차** 이중 적용
- `AdapterRuntimeContext`를 반드시 사용 (직접 secret을 closure에 들고 있지 않음)

## 3. Reference Implementation

`packages/providers/src/node/codexCliOAuthAdapter.ts`를 주요 참고로 한다.

주요 패턴:
- `CodexExecRunner` 추상화로 실행 로직 분리 (테스트 용이)
- `spawn` 사용
- `timeoutMs`와 `AbortSignal`을 `AdapterRuntimeContext`에서 받아 처리
- `redactSecretsForLog` + `truncateForLog` 적용
- `exitCode`, `signal`, `timedOut`를 구분하여 `AdapterError` 생성

## 4. CLI Provider 실행 모델 (제안)

### 4.1 Subprocess 실행
- `node:child_process`의 `spawn` 사용
- `shell: false` (절대 true 금지)
- `stdio`: `['pipe', 'pipe', 'pipe']` (stdin으로 prompt 전달, stdout/stderr 분리 캡처)

### 4.2 Prompt 전달 방식
- **기본**: stdin으로 prompt 전체 전달
- 예시:
  ```ts
  const child = spawn(binPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.write(request.messages.map(m => m.content).join('\n'));
  child.stdin.end();
  ```

### 4.3 Timeout & Cancellation
- `AdapterRuntimeContext.timeoutMs` 사용
- `AdapterRuntimeContext.abortSignal`을 `child.kill()`과 연동
- 타임아웃 발생 시 `timedOut: true` 플래그와 함께 `AdapterError` 생성

### 4.4 Error Mapping

기존 `AdapterErrorCategory`를 최대한 재사용:

| 상황 | Category | 비고 |
|------|----------|------|
| binary 없음 | `unknown` 또는 `provider` | "binary not found" 메시지 |
| non-zero exit | `provider` | stderr 내용 일부 포함 (redacted) |
| stdout empty | `provider` | "CLI returned empty output" |
| stdout parse 실패 (JSON 등) | `provider` (임시) | **신규 category 제안 필요** |
| timeout | `network` 또는 `provider` | `timedOut: true` |
| abort/cancel | `network` | `cause`에 AbortError |

**중요**: `parsing` 관련 category가 현재 존재하지 않음. 필요 시 별도 논의 필요.

## 5. Redaction 전략

1. **Adapter 내부 1차 redaction**
   - stderr 전체와 stdout 일부를 `redactSecretsForLog` 통과시킴
   - `providerRawSnippet`에는 redacted된 값만 저장

2. **상위 레이어 2차 redaction**
   - `AdapterRuntimeContext.onRawError` 호출 시 이미 redacted된 값을 전달
   - server/desktop 로그 레이어에서도 한 번 더 적용

## 6. Trust & Registry Metadata

CLI Provider 등록 시 권장 값:

```ts
{
  trustLevel: "limited",           // 기본
  authMode: "cli_session",
  secretAvailability: "available", // CLI가 로그인 되어 있으면 available
  requiresLocalBinary: true,
  localBinaryName: "grok" | "gemini",
  tags: ["cli", "no-api-key", "local-session"]
}
```

`trusted`로 올리려면 명시적인 설정(예: `forceTrusted: true`)이 필요하도록 설계.

## 7. 제안 파일 구조

```
packages/providers/src/node/
  grokCliAdapter.ts
  geminiCliAdapter.ts
  cli-exec-runner.ts          # 공통 실행 로직 (Codex와 공유 가능)
  cli-exec-runner.test.ts
```

## 8. 테스트 요구사항 (최소)

반드시 작성해야 할 테스트 케이스:

- prompt가 command argument로 전달되지 않는지 검증
- stdin으로 prompt가 정상 전달되는지
- timeout 발생 시 child process가 종료되는지
- AbortSignal 전달 시 child process가 종료되는지
- stderr에 secret이 포함된 경우 redaction 되는지
- stdout이 empty일 때 적절한 `AdapterError` 발생
- stdout이 예상치 못한 format일 때 처리
- binary가 없을 때 graceful한 에러
- non-zero exit 시 적절한 에러
- `trustLevel: "limited"`가 기본으로 적용되는지
- provider registry metadata에 `authMode: "cli_session"`, `secretAvailability` 등이 올바르게 노출되는지

## 9. Open Questions (추후 Codex 결정 필요)

- `AdapterErrorCategory`에 `stdout_parse_failure` 같은 새 카테고리를 추가할 것인가?
- CLI provider가 `discoverModels`에서 실제로 `grok --list-models` 같은 명령을 호출할 것인가, 아니면 하드코딩할 것인가?
- `grok`과 `gemini` CLI의 출력 포맷이 달라질 경우, 파싱 로직을 어디까지 공통화할 것인가?

---

**현재 상태**: 이 문서는 타입 확인 후 작성된 초안입니다.
실제 구현 시 `CodexCliOAuthAdapter`의 `runCodexExec` 패턴을 최대한 재사용하는 방향으로 진행할 것을 제안합니다.
