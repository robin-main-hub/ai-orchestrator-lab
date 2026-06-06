# Security Audit Checklist

모든 PR이 머지 전에 통과해야 하는 보안 기준점. 이 repo의 보안 표면이 작지 않다 (외부 도메인 노출 + 다중 provider secret + multi-channel ingress + 향후 ERP 같은 real-money action), 그래서 한 번 만들어둔 패치가 6개월 후에도 똑같이 막혀있어야 한다.

이 문서는 새 코드를 만들지 않는다. **기존 PR (C1, C2, #19 진단, #29 Anthropic, #30 cleanup, #35 permission spec)이 이미 깔아둔 보안 layer를 정리하고 다음 PR이 무엇을 자동으로 거쳐야 하는지 명시한다.**

## 1. 사용 방식

- PR 작성자: 작성 후 §3의 카테고리별 체크리스트 중 본인 PR이 건드린 영역만 self-check
- 리뷰어 (사용자 / 코덱스 / Claude): 본인 영역 카테고리에 새 risk가 추가됐는지 확인
- 자동화: §6 항목은 `pnpm typecheck` / `pnpm test` / smoke 스크립트에 이미 포함되거나 추가될 수 있음

머지 차단 기준: **Critical 발견 시 반드시 차단. High는 follow-up PR 약속 + work-board 백로그 등록 시 통과. Medium 이하는 머지 후 정리 OK.**

## 2. 카테고리 인벤토리

| # | 카테고리 | 현재 layer | 관련 PR / docs |
|---|---|---|---|
| A | Authentication | Bearer token (`ORCHESTRATOR_API_TOKEN`) | #9 (C1) |
| B | Authorization | Permission/Approval spec | docs/29 (#35) — 구현은 F1~F3 대기 |
| C | Input validation | Zod schemas on all POST endpoints | #10 (C2) |
| D | Body size limits | 1MB cap, 413 on overflow | #10 (C2), #20 hotfix |
| E | Secret redaction (output logs) | `SECRET_LIKE_PATTERNS` + `redactSecretsForLog` | C2 + `packages/providers/src/errors.ts` |
| F | Secret storage | Env vars / OAuth files, no raw secret in event log | #21 (Codex OAuth), C2 secret rejection |
| G | PII handling | Spec only (§5 docs/29) | docs/29 §5 |
| H | Network — CORS | Origin whitelist + env extension | #9 (C1) + 5174 보강 |
| I | Network — TLS | Cloudflare Universal SSL | 운영 — Tunnel 셋업 |
| J | Network — fallback policy | Primary/LAN, transport-level only | mobile `lib/api.ts`, server smoke |
| K | Backup / Export redaction | `redactionRequired` flag only | docs/29 §5 — 실 룰 미구현 |
| L | Provider trust gating | TrustLevel × SourceTrust matrix | docs/29 §8 — 구현은 F1~F3 |
| M | External channel ingress | IngressGuard 7-step pipeline | docs/15 + docs/29 §6.7 — receiver 미구현 |
| N | Approval queue / 2FA | Spec + mobile 더보기 탭 자리 | docs/29 §7 — 구현은 F4~F5 |
| O | Logging hygiene | `redactSecretsForLog` everywhere stderr → user-facing | C2 + adapter `onRawError` callback |
| P | DGX deployment | RAM safety 3 rules | user memory + work-board |
| Q | Rate limiting | None (server) | 미구현 — adapter category만 |
| R | Audit log (PermissionMatrixItem) | Type only | docs/29 §3 step 8 — 구현은 F3 |
| S | Adapter contract conformance | Contract test fixtures | #33 |

## 3. PR 영역별 체크리스트

### 3.1 server endpoint 신규/변경 (`apps/server/src/index.ts`)

- [ ] **A** `requireAuth()` 통과 후에만 핸들러 실행 — `/health` 외엔 모두
- [ ] **C** request body는 protocol의 zod schema로 `parse()` — 통과 시 type assert, 실패 시 400
- [ ] **D** `readJsonBody` 사용 (1MB 자동 제한)
- [ ] **H** 응답에 `createCorsHeaders(originHeader)` 사용 — 직접 헤더 작성 X
- [ ] **O** 에러 응답 message에 raw upstream body 그대로 echo 금지 — `redactSecretsForLog(text.slice(0, 240))` 필수
- [ ] **R** 보호 대상 action이면 `PermissionMatrixItem` event emit (F3 이후)
- [ ] **Q** 신규 endpoint가 외부에서 호출되면 rate limit 정책 결정 필요 (현재 미구현 — work-board 백로그 추가)

### 3.2 protocol schema 신규/변경 (`packages/protocol/src/index.ts`)

- [ ] **C** 외부 입력 받는 모든 type은 **zod schema도** 같이 export
- [ ] schema 변경 시 server `index.test.ts` + adapter test의 fixture 영향 확인
- [ ] enum 값 추가는 다른 권한 카테고리 (`PermissionAction`, `PermissionLevel` 등)와 정합 확인
- [ ] **F** secret/key를 schema 안에 그대로 받는 필드 추가 금지 — `secretRef` / `apiKeyRef` 패턴
- [ ] @deprecated 표시한 type은 별도 cleanup PR로 제거 (rename 시 자동 제거 금지)

### 3.3 LLM adapter 신규 (`packages/providers/src/*Adapter.ts`)

- [ ] **S** `LlmAdapter` interface 정확히 구현 (`profileId`, `kind`, `discoverModels`, `complete`)
- [ ] **F** `AdapterRuntimeContext.resolveSecret()` 통해서만 secret 받음 — closure capture 금지
- [ ] **O** 에러 snippet은 `redactSecretsForLog` → `truncateForLog` 통과 후 `AdapterError.providerRawSnippet`에
- [ ] **A** `requiresAuth: true` 기본값 (Ollama 같은 local-only는 명시적으로 false)
- [ ] timeout/AbortSignal 처리 (`createRequestSignal` 패턴)
- [ ] 응답 status에 따른 `AdapterError` category 매핑 (`AdapterError category mapping` per `docs/24` §7)
- [ ] **S** `xxxAdapter.contract.test.ts` 추가 — 6 standard contract cases 통과 필수 (`docs/24` §13)
- [ ] **G/E** request payload에 secret이 echo되지 않음 확인 (e.g., Anthropic은 `x-api-key` 헤더만, body에 X)
- [ ] **L** untrusted provider 응답을 trusted source memory에 자동 저장 금지

### 3.4 desktop runtime 변경 (`apps/desktop/src/runtime/*`)

- [ ] **A** server 호출 시 `Authorization: Bearer ${VITE_ORCHESTRATOR_API_TOKEN}` 부착
- [ ] **J** primary → fallback URL 순서 (transport-level 실패만 fallback)
- [ ] **E** error message를 UI에 표시할 때 redaction 적용
- [ ] **L** untrusted provider 응답은 memory inspector에 trust 표시
- [ ] event payload 생성 시 secret 패턴 검사 (server가 다시 검사하지만 client-side 1차)

### 3.5 mobile (`apps/mobile/src/*`)

- [ ] **A** 모든 DGX call에 Bearer 부착 — `lib/api.ts` 사용
- [ ] **F** API 토큰은 `localStorage`에만, never `sessionStorage` (탭 닫혀도 유지), never sync에 노출
- [ ] **G** clipboard paste / 첨부 파일에 secret 패턴 — 업로드 전 client-side warning
- [ ] **N** 승인 큐 액션 (swipe approve/reject) 확정 전 2단계 확인 (high-stakes action만)
- [ ] PWA manifest의 `permissions` 필드 신중 (background sync, push 등 추가 시 권한 확장)

### 3.6 docs 신규

- [ ] **F/G** 본문에 실제 secret / 키 / API endpoint 절대 안 적힘 (모두 `<redacted>` 또는 ENV var 이름)
- [ ] 외부 사용자 정보 (이메일, 전화, 거래처 실명) 안 적힘
- [ ] 도메인 지식 (회사 정책, 거래처 룰)이 들어가야 한다면 trust 표시 (예: "내부 전용" 헤더)
- [ ] 다른 docs 참조는 상대경로 (`docs/29-permission-engine-spec.md`)

### 3.7 server 배포 (DGX-02)

- [ ] **P** `.env` 파일 백업 후 `git pull`
- [ ] **P** vLLM이 큰 inference 큐 작업 중이면 배포 후 server smoke만 (vLLM 부하 추가 X)
- [ ] `corepack pnpm install` → `corepack pnpm typecheck` → `corepack pnpm test` 다 통과 후 `pnpm server:build`
- [ ] `sudo systemctl restart ai-orchestrator-server` → `status` `active` 확인
- [ ] `curl https://orchestrator.endruin.com/health` 200 + auth 401 + Bearer 200 검증
- [ ] `cloudflared-orchestrator` 상태 확인 (active)
- [ ] 배포 직후 1시간 로그 모니터링 (auth 실패 spike, 500 spike)

### 3.8 신규 외부 endpoint 노출

- [ ] **A/B** 모든 access는 Bearer 또는 OAuth 통과
- [ ] **H** CORS allow-origin이 와일드카드 (`*`) 아님 — whitelist
- [ ] **I** HTTPS only (HTTP fallback 금지)
- [ ] **Q** rate limit 정책 결정 (현재 미구현이라 외부 트래픽 polling 받으면 즉시 risk)
- [ ] **K** 외부에서 도달 가능한 path 중 `/events`, `/event-storage`, `/sessions` 같은 데이터 노출 endpoint는 trust level 별 redaction 확인

## 4. Severity 분류

| 등급 | 정의 | 머지 차단 | 예 |
|---|---|---|---|
| **Critical** | 외부 인터넷에서 즉시 악용 가능 | ✅ 차단 | C1 미적용 외부 노출, 토큰 echo, body limit 없음 |
| **High** | 인증된 사용자가 우회 가능 / 정책 우회 가능 | 🟡 follow-up PR 약속 시 통과 | redaction 누락, audit log 누락 |
| **Medium** | 정보 노출 (정책상 무관한 곳에 leak) | ⬜ 머지 후 정리 | health endpoint storage 경로 (이미 해결) |
| **Low** | 운영 편의 개선 | ⬜ 백로그 | rate limit 부재 (외부 사용자 적을 때) |
| **Info** | 관찰만 | ⬜ | TLS 인증서 만료 알림 |

## 5. 이미 닫힌 / 잘 닫힌 케이스

| Risk | 닫은 시점 | 어떻게 |
|---|---|---|
| 외부 도메인 미인증 호출 (Critical) | #9 C1 | Bearer auth + CORS whitelist |
| 1MB+ body DoS (High) | #10 C2 + #20 | 413 + RequestBodyTooLargeError |
| Zod 미검증 payload (High) | #10 C2 | providerCompletionRequest/remoteExecution schema |
| Provider raw response의 secret echo (High) | #10 C2 + 어댑터 | redactSecretsForLog + truncateForLog |
| Event payload secret 저장 (High) | C2 | containsSecretLikeText + rejection |
| /health storage 경로 노출 (Medium) | #9 보강 | redactInternalPathsForPublicHealth |
| Codex OAuth secret leak (Critical) | #21 | OAuth 파일은 어댑터가 직접 안 읽고 CLI에 위임 |
| Anthropic key를 Authorization Bearer로 잘못 보냄 (Medium) | #29 | `x-api-key` 헤더로 교정 |
| OpenAI-compatible adapter 의 timeout 부재 (Low) | #24 | createRequestSignal 패턴 |
| 모바일 토큰 sync에 leak (High) | mobile PR | localStorage only, show/hide toggle |

## 6. 자동화 가능한 부분 (현재 / 향후)

| 항목 | 현재 | 향후 |
|---|---|---|
| typecheck | ✅ `pnpm typecheck` | — |
| unit test (어댑터 contract) | ✅ `pnpm --filter @ai-orchestrator/providers test` | 모든 어댑터에 contract 적용 |
| server smoke (auth/413/400/200) | ✅ `pnpm server:smoke` | regression mode 항상 실행 |
| secret 패턴 grep on PR diff | ❌ | CI에서 `git diff main..HEAD | grep -E "sk-|Bearer [a-zA-Z]"` 같은 룰 추가 |
| permission policy snapshot test | ❌ | F3 이후 — 정책 매트릭스 변경 감지 |
| dependency CVE scan | ❌ | `npm audit` / GitHub Dependabot |
| TLS expiry monitoring | ❌ | Cloudflare 자동 + 별도 cron 알림 |

## 7. 미구현 / 알려진 위험 (work-board 백로그)

| Risk | 등급 | 닫힐 시점 |
|---|---|---|
| Server rate limit 없음 | Low (현재) → High (외부 사용자 늘면) | 별도 PR |
| Permission/Approval enforcement (typed only) | High | F1~F3 코덱스 |
| Redaction rule pipeline 5 stage 중 (1, 2, 3) 부분만 | Medium | F7 코덱스 |
| Ingress guard 7-step receiver 0 구현 | Medium | F9 |
| 2FA (device_reboot, secret_view, payment) | High (실 실행 시) | F4~F5 mobile |
| Audit log 영속화 (PermissionMatrixItem in Event Storage) | High | F3 |
| Backup/Export redaction (pre_backup stage) | High | F7 |
| External send (email/customer_reply) redaction | High | F7 |
| Mobile push 2FA flow | High | F5 |
| External Ingress bot ingress receiver | Medium | F9 |
| Provider OAuth refresh layer (`refresh_required` 카테고리만 정의) | Medium | F4 또는 별도 |
| ERP-도메인 actions (`payment_action` 등) 정책 미정 | High (ERP 진입 시) | ERP 진입 직전 |

## 8. 신규 PR이 자기 영역에 안 들어가는데 새 보안 risk를 만들 때

- **새 endpoint를 추가했는데 §3.1 체크리스트 안 거침** → 차단
- **secret을 새 path에 저장 (`.env` 외)** → 차단
- **외부 사용자에게 노출되는 정보를 추가 (event log, backup, mobile API response)** → §3.6 + §3.8 통과 필요
- **새 permission action 추가하는데 정책 매트릭스 정의 안 함** → F2 정책에 row 추가 필수

## 9. 사용 예 (가상)

> "Tracy SOUL이 거래처 이메일을 자동 작성해서 보내는 기능 추가"
>
> 영향 카테고리: B (authz) + G (PII — 거래처 이메일) + K (외부 send redaction) + N (approval)
>
> 자동 체크:
> - PermissionAction은 `customer_reply` 또는 `external_message_send`
> - 정책 매트릭스: `actor=agent` row에서 → `approval_required` (deny가 default가 아님 — 기존 정책)
> - Redaction: `pre_share` stage 적용 — 내부 코드명, 미공개 가격 등 차단
> - mobile 승인 큐로 자동 enqueue
> - 사용자 승인 후에만 SMTP 호출
> - PermissionMatrixItem event emit
>
> 머지 차단: 위 항목 중 하나라도 누락 → High 등급 → follow-up PR 약속 받고 통과

## 10. 본 문서가 닫지 않는 것

- 코드 자동 검증 (이건 CI/CD 작업 — 별도)
- Threat modeling (전체 시스템에 대한 STRIDE 분석 등 — 향후 별도 문서)
- 사용자 자신에 대한 단독 사용자 가정 — 멀티 사용자 시나리오는 별도 spec
- LLM 모델 자체의 prompt injection / jailbreak — provider 측 책임

## 11. 다음 라운드

- F1 (RedactionRule schema) 머지 후 §3.3 어댑터 체크리스트에 항목 추가
- F3 (server PermissionMatrixItem emit) 머지 후 §3.1에 R 항목 자동화 가능
- F9 (Ingress guard receiver) 머지 후 §3.8 외부 endpoint 체크리스트 확장

## 12. CLI 기반 Provider (grok -p, gemini -p, codex 등)

이 공식 가이드는 로컬 CLI를 subprocess로 호출하는 provider (grok, gemini, codex 등)에 적용되는 보안 및 아키텍처 체크리스트다.

### 12.1 필수 체크 항목

- [ ] **Subprocess 실행 방식 및 환경변수 allowlist**
  - `spawn` 또는 `execFile` 사용, `shell: false` 지정 필수 및 `shell: true` 절대 금지
  - prompt는 **stdin**으로만 전달 (command line argument로 넘기지 않음)
  - `process.env` 전체를 subprocess에 직접 상속(inheritance)하지 않아야 함
  - 작동에 필요한 필수 환경변수만 화이트리스트(allowlist)로 명시하여 자식 프로세스 생성 시 `env` 옵션으로 전달 (OAuth token, API key, internal SSO 인증정보 등 불필요한 민감 정보의 자식 프로세스 유출 차단)
- [ ] **Stream Backpressure 및 Deadlock 방지**
  - 대용량 prompt를 stdin으로 넘길 때 `write()` 반환값을 감시하고 버퍼가 찰 경우 `drain` 이벤트를 대기하여 backpressure 조절
  - stdout/stderr 데이터 수신 시, 무제한 버퍼링을 방지하기 위한 최대 캡처 제한(capture limit, e.g. 5MB) 및 truncation 전략 적용
  - 버퍼 오버플로우나 파이프 막힘으로 인해 프로세스가 멈추는 데드락(deadlock) 방지 로직 적용
- [ ] **Timeout / Cancellation 및 프로세스 Lifecycle Cleanup**
  - `AdapterRuntimeContext.timeoutMs`와 `abortSignal`을 반드시 적용
  - timeout 또는 abort 발생 시, 그리고 부모 프로세스 종료(SIGINT, SIGTERM, exit) 시 child process가 방치되거나 orphan/zombie로 남지 않도록 명시적인 프로세스 트리 cleanup/kill 로직 적용
  - detached child process 사용 금지 또는 명시적인 라이프사이클 관리 필수
- [ ] **Command/Credential Injection 방지**
  - prompt 내용이 command line argument로 들어가지 않음
  - stdin 전달 시에도 shell metacharacter escape 불필요하게 만들기 (가능하면 binary에 직접 전달)
- [ ] **Stderr/Stdout Redaction**
  - stderr/stdout 전체를 `redactSecretsForLog` 통과시킨 후에만 로깅 또는 `providerRawSnippet`에 저장
  - 원문 출력(stderr/stdout)은 절대 Event Storage, 로그 파일, UI 화면에 노출 금지
- [ ] **Token/Log/Process-List 노출 방지**
  - `curl -H "Authorization: Bearer ..."` 같은 argv 기반 credential 전달 금지 (shared/multi-user 호스트에서 `ps` 명령어 등으로 토큰 노출 우려)
  - 인증 자격증명은 stdin 또는 별도 config 파일을 통해서만 전달하고, process-list에 토큰이 아규먼트로 노출되지 않는 수단(mitigation) 강구
- [ ] **OAuth / Local Session Trust Boundary**
  - CLI가 로그인 세션에 의존하는 경우, `trustLevel`은 기본 `limited`
  - `trusted`로 올리려면 명시적 설정 필요
  - CLI binary 경로, home directory 등이 registry에 안전하게 노출되는지 확인
- [ ] **Missing Binary / Non-zero Exit 처리**
  - binary가 없을 때 graceful한 `AdapterError` 발생
  - non-zero exit 시 stderr (redacted)를 적절히 포함하되 raw leak 방지
- [ ] **Stdout Parsing Failure**
  - empty stdout, non-JSON, unexpected format 시 `AdapterError` category 명확히 정의
  - parsing 실패 시에도 secret leak이 발생하지 않도록 처리
- [ ] **Secret Leakage Test**
  - CLI stderr/stdout에 API 키, OAuth 토큰, 개인정보가 섞여 나올 수 있는 모든 케이스에 대해 redaction 테스트 필수
- [ ] **Provider Registry Metadata**
  - `authMode: "cli_session"`
  - `secretAvailability`
  - `trustLevel`
  - `requiresLocalBinary`, `localBinaryName` 등이 정확히 등록되는지 검증

### 12.2 금지 행위

- CLI를 호출할 때 prompt를 shell argument로 전달
- `process.env` 전체를 자식 프로세스에 그대로 상속(direct inheritance)
- curl 실행 시 헤더 토큰(`Authorization: Bearer ...`)과 같은 민감정보를 argv 인자로 직접 전달
- 대용량 입력/출력 스트림에 대한 backpressure 및 truncation 제한 없이 버퍼링하여 데드락 위험 노출
- stderr/stdout 원문을 필터링(redaction) 없이 로그나 Event Storage에 그대로 저장
- CLI binary 경로를 하드코딩하거나 사용자 입력으로 받을 때 sanitization 없이 사용
- OAuth 세션 파일(`~/.grok/auth.json`, `~/.gemini/oauth_creds.json` 등) 경로를 provider metadata에 직접 노출

### 12.3 테스트 필수 항목

- prompt가 command line argument로 전달되지 않고 `shell: false` 및 stdin을 통해 전달되는지 검증
- 부모 프로세스 비정상 종료 / timeout / abort 발생 시 자식 프로세스가 완전히 kill 및 cleanup되는지 검증
- 명시된 allowlist 이외의 부모 환경변수가 자식 프로세스에 유출(leakage)되지 않는지 환경변수 격리 테스트
- 대용량 prompt 및 대규모 stdout 수신 시 backpressure 조절 및 데드락 없이 안정적으로 스트리밍/truncation 되는지 검증
- stderr/stdout에 secret이 포함되어 출력되는 경우 `redactSecretsForLog`를 통해 마스킹되는지 검증
- `ps` 등 시스템 프로세스 리스트 상에서 bearer token이 노출되는 취약점(argv 노출) 존재 여부 검토
- binary missing, non-zero exit, empty stdout, parse failure 각각에 대해 올바른 `AdapterError`가 발생하는지
- registry에 CLI provider metadata가 올바르게 등록되는지

머지 차단 기준: 위 항목 중 Critical에 해당하는 항목이 하나라도 미준수 시 차단.
