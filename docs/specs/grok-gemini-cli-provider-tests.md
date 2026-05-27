# Grok & Gemini CLI Provider - Test Requirements

## 1. 목적

이 문서는 `grok -p`와 `gemini -p` CLI provider 구현 시 반드시 통과해야 하는 테스트 케이스를 정의한다.

테스트는 **production code 수정 전에 먼저 작성**하고 실패를 확인하는 TDD 방식을 권장한다.

## 2. 필수 테스트 케이스

### 2.1 Subprocess 실행 안전성

| ID | 테스트 케이스 | 기대 결과 | 우선순위 |
|----|---------------|-----------|----------|
| T-01 | prompt에 shell metacharacter (`;`, `&&`, `` ` ``, `$()`)가 포함된 경우 | command argument로 전달되지 않고 stdin으로만 전달됨 | P0 |
| T-02 | prompt가 command line argument로 들어가지 않는지 검증 | spawn/execFile 호출 시 args 배열에 prompt 전체가 들어가지 않음 | P0 |

### 2.2 stdin 전달

| ID | 테스트 케이스 | 기대 결과 | 우선순위 |
|----|---------------|-----------|----------|
| T-03 | prompt가 stdin으로 정상 전달되는지 | CLI가 stdin에서 prompt를 읽어서 처리 | P0 |
| T-04 | 큰 prompt (10만자 이상) 전달 시에도 정상 동작 | buffer overflow 없이 처리 | P1 |

### 2.3 Timeout & Cancellation

| ID | 테스트 케이스 | 기대 결과 | 우선순위 |
|----|---------------|-----------|----------|
| T-05 | `timeoutMs` 설정 시 해당 시간 초과하면 child process 종료 | `timedOut: true`와 함께 `AdapterError` 발생, process killed | P0 |
| T-06 | `AbortSignal` abort 시 child process 즉시 종료 | signal 전달 후 process가 killed됨 | P0 |
| T-07 | timeout과 abort가 동시에 걸린 경우 | race condition 없이 안전하게 종료 | P1 |

### 2.4 에러 처리

| ID | 테스트 케이스 | 기대 결과 | 우선순위 |
|----|---------------|-----------|----------|
| T-08 | CLI binary가 존재하지 않을 때 | 명확한 `AdapterError` (category: provider 또는 unknown) | P0 |
| T-09 | CLI가 non-zero exit code로 종료될 때 | stderr (redacted) 포함하여 `AdapterError` 생성 | P0 |
| T-10 | stdout이 empty일 때 | `AdapterError` 발생 (category: provider) | P0 |
| T-11 | stdout이 JSON이 아니거나 예상치 못한 format일 때 | parsing 실패 처리 (기존 category 또는 신규 category) | P0 |

### 2.5 Redaction

| ID | 테스트 케이스 | 기대 결과 | 우선순위 |
|----|---------------|-----------|----------|
| T-12 | stderr에 API 키, OAuth 토큰, 개인정보가 포함된 경우 | `redactSecretsForLog` 통과 후에만 로깅/저장 | P0 |
| T-13 | stdout에 secret이 섞여 나온 경우 | providerRawSnippet에 redacted된 값만 들어감 | P0 |

### 2.6 Trust & Registry

| ID | 테스트 케이스 | 기대 결과 | 우선순위 |
|----|---------------|-----------|----------|
| T-14 | CLI provider 등록 시 `trustLevel` 기본값이 `limited`인지 | registry metadata에 `limited`로 표시 | P0 |
| T-15 | `authMode`가 `cli_session`으로 올바르게 등록되는지 | metadata 검증 | P0 |
| T-16 | `requiresLocalBinary: true`, `localBinaryName`이 정확히 설정되는지 | metadata 검증 | P1 |

## 3. 테스트 작성 권장 순서 (TDD)

1. T-01, T-02 (command injection 방지) 먼저 작성 → 실패 확인
2. T-05, T-06 (timeout/cancel) 작성
3. T-08 ~ T-11 (에러 처리) 작성
4. T-12, T-13 (redaction) 작성
5. 나머지

## 4. Mock 전략

- `CodexCliOAuthAdapter`처럼 `runCliExec` 같은 runner 함수를 주입받게 하여 테스트에서 mock 가능하도록 설계
- 실제 `grok`/`gemini` binary 없이도 모든 케이스 테스트 가능하게 구성

## 5. Open Question

- stdout이 특정 포맷 (JSONL, plain text 등)일 때 parsing 로직을 어디까지 공통화할 것인가?
- CLI별로 다른 exit code 의미를 어떻게 표준화할 것인가?

---

이 문서는 `docs/specs/grok-gemini-cli-provider-plan.md`와 함께 CLI provider 구현 착수 전에 반드시 검토되어야 한다.
