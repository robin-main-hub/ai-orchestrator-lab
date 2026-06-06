# Permission / Redaction 공통 관문 (spec)

`provider 호출`, `remote run`, `mobile input`, `device reboot`, 향후 `tmux dispatch`, `external send` — 이 모두가 같은 승인/제거 규칙을 거쳐야 한다는 게 사용자 요청 #3의 핵심.

이 문서는 새 schema를 제안하는 게 아니라 — **이미 protocol에 정의되어 있지만 활용되지 않는 schemas를 어디서 어떻게 호출할지** 정리한다. 코덱스/Claude가 후속 구현(사용자 요청 #4 budget guard, #5 승인 UX, #6 Secret 상태 표시)할 때의 ground truth.

## 1. 이미 protocol에 있는 것 (활용만 하면 됨)

| 자산 | 위치 | 형식 | 활용 상태 |
|---|---|---|---|
| `permissionLevelSchema` | `packages/protocol:632` | zod enum (7개: read_only / write_files / run_safe_commands / run_dangerous_commands / network_access / remote_workspace / secret_access) | ✅ 정의 / ❌ 코드 enforcement 0 |
| `approvalStateSchema` | `packages/protocol:643` | zod enum (5개: not_required / required / approved / rejected / expired) | ✅ 정의 / 🟡 `RemoteExecutionRequest.approvalState`만 일부 활용 |
| `permissionRequestSchema` | `packages/protocol:652` | zod object | ✅ 정의 / ❌ 생성/저장 0 |
| `permissionActorSchema` | `packages/protocol:750` | zod enum (5개: user / agent / external_channel / mobile / server) | ✅ 정의 / ❌ 활용 0 |
| `PermissionAction` | `packages/protocol:726` | TS type (21개: conversation_reply / memory_write / backup_export / terminal_run / file_write / remote_workspace / provider_completion / device_reboot / secret_view / mobile_approval / email_send / customer_reply / external_message_send / document_share / calendar_create / quote_send / invoice_create / payment_action / contract_review / deploy / git_push / unknown_external_effect) | ✅ 정의 / ❌ 활용 0 |
| `PermissionDecision` | `packages/protocol:753` | TS type (allow / approval_required / deny) | ✅ 정의 / ❌ 활용 0 |
| `PermissionMatrixItem` + `Snapshot` | `packages/protocol:755, 781` | TS type | ✅ 정의 / ❌ 활용 0 |
| `IngressEvent` + `IngressGuardResult` | `packages/protocol:681, 703` | TS type | ✅ 정의 / ❌ 활용 0 (Ingress receiver 자체가 미구현) |
| `ApprovalQueueItem` | `packages/protocol:770` | TS type | ✅ 정의 / ❌ 활용 0 |
| `ExternalApprovalItem` | `packages/protocol:716` | TS type | ✅ 정의 / ❌ 활용 0 |

요점: **schemas는 거의 다 있다.** 진짜 갭은 (a) 코드에서 호출 안 됨, (b) `redactionRule` 같은 일부 누락, (c) 통합 흐름 spec 부재.

## 2. 진짜 갭 (이 spec이 닫음)

### A. 활용 안 됨
- `/provider-completions` 호출 시 `PermissionMatrixItem` 생성 0 — 누가 어떤 권한으로 호출했는지 기록 안 됨.
- `/remote-runs`는 `approvalState`만 보고 분기 (`createRemoteRunResponse` `apps/server/src/index.ts`) — `PermissionAction`/`PermissionActor`/`SourceTrust` 결합한 결정 0.
- `IngressGuardResult`는 type만 있고 receiver 자체 없음 (`docs/15-agent-topology-and-ingress-guards.md`에 설계, 코드 0).
- 모바일/외부 인입에서 들어온 요청에 대한 통합 evaluator 0.

### B. 일부 누락된 schema
- **`RedactionRule`** — `redactionApplied: boolean` 필드만 있고 어떤 룰을 적용했는지/어디 적용해야 하는지 spec 0. SECRET_LIKE_PATTERNS (C2)는 server에 있지만 protocol-side schema 없음.
- **`PermissionEvaluationContext`** — evaluator에 들어가는 입력 묶음 (action / actor / sourceTrust / requestedLevels / providerProfileId / cost-estimate 등) 한 번에 표현하는 타입.

### C. 통합 흐름 spec 부재
- request → permission check → approval (필요 시) → redaction → execution → emit event 의 표준 흐름이 어디에도 명시 안 됨. 매 endpoint가 ad-hoc.

## 3. 통합 흐름 (제안)

모든 보호 대상 동작은 같은 8단계를 거친다:

```
1. Inbound request          (provider call / remote run / mobile / external / tmux dispatch / external send)
       │
2. Build PermissionEvaluationContext
       │  { action: PermissionAction,
       │    actor: PermissionActor,
       │    sourceTrust: SourceTrust,
       │    requestedLevels: PermissionLevel[],
       │    payloadFingerprint: string,
       │    sessionId, providerProfileId, costEstimateTokens? }
       │
3. Permission engine evaluate(ctx) → PermissionDecision
       │  ┌─ allow              → step 6
       │  ├─ approval_required  → step 4
       │  └─ deny               → step 8 (rejected event)
       │
4. Enqueue ApprovalQueueItem (state: required) + notify channels
   (desktop drawer / mobile push / external message)
       │
5. Wait for approval response (user / mobile)
       │  ┌─ approved → step 6
       │  └─ rejected/expired → step 8
       │
6. Apply RedactionRule pipeline to payload + response
       │  (provider's trustLevel, SourceTrust, secret pattern)
       │
7. Execute (provider call / shell / file write / send / ...)
       │
8. Emit event: PermissionMatrixItem (decision, reason)
   + outcome event (succeeded / failed / blocked / rejected)
```

evaluator는 순수 함수 (`evaluate(ctx, policy) → decision + reason`). 정책 자체는 별도 `PolicyMatrix` 객체로 — 시작은 hardcoded, 향후 user-editable.

## 4. 정책 매트릭스 (시작 룰)

| Action | actor=user, sourceTrust=trusted | actor=external_channel, sourceTrust=untrusted | actor=agent, sourceTrust=limited |
|---|---|---|---|
| `provider_completion` | allow | approval_required (단 trust=trusted provider) / deny (untrusted provider) | allow (단 cost guard 통과 시) |
| `memory_write` | allow | approval_required | allow (sourceChannel 기록) |
| `backup_export` | allow | deny | approval_required |
| `terminal_run` (safe) | approval_required (first time) → allow (whitelist) | deny | deny |
| `terminal_run` (dangerous) | approval_required | deny | deny |
| `file_write` (project) | allow | deny | approval_required |
| `file_write` (workspace) | approval_required | deny | deny |
| `device_reboot` | approval_required + 2FA | deny | deny |
| `secret_view` | approval_required + 2FA | deny | deny |
| `mobile_approval` | n/a (자체 액션) | n/a | n/a |
| `email_send`, `customer_reply`, `payment_action`, `quote_send`, `invoice_create`, `contract_review`, `deploy`, `git_push` | approval_required | deny | deny |
| `external_message_send` | approval_required | deny | deny |
| `document_share` | approval_required | deny | approval_required |
| `unknown_external_effect` | deny (whitelist 외) | deny | deny |

기본 원칙:
- **untrusted source** (external, api, mobile guest) → memory recall 차단, 모든 effect는 approval_required 또는 deny.
- **dangerous default**: 정책 매트릭스에 명시 안 된 조합은 `deny`. allow는 명시적으로만.
- **2FA**: `device_reboot`, `secret_view`, `payment_action`은 모바일 push + 코드 입력 (향후).
- **Cost guard** (사용자 #4): `provider_completion`은 추정 토큰 cost가 thresholds 초과 시 `approval_required`로 강등.

## 5. Redaction rule pipeline

C2의 `SECRET_LIKE_PATTERNS` (server `apps/server/src/index.ts`)는 secret 검출용. 더 큰 redaction은 다음 5단계:

| 단계 | 입력 | 검사 | 처리 |
|---|---|---|---|
| 1. Pre-send (request payload) | provider call 직전 | SECRET_LIKE_PATTERNS, PII (이메일/전화/주민번호 패턴), private key blocks | `<redacted>` 치환 + RedactionLogEvent emit |
| 2. Post-receive (provider response) | provider 응답 직후 | 같은 패턴 — provider가 secret 에코하면 차단 | `<redacted>` 치환 |
| 3. Pre-store (event payload) | Event Storage 저장 직전 | 모든 위 패턴 + sourceTrust 기반 추가 룰 | secret 발견 시 event 저장 거부 (이미 C2에 있음) |
| 4. Pre-backup (Obsidian/Notion projection) | backup 생성 직전 | 패턴 + provider trustLevel (untrusted provider 응답은 더 strict) | redactionRequired flag → 위반 시 export 거부 |
| 5. Pre-share (external send) | email/customer_reply/document_share 실행 직전 | 패턴 + customer-facing 추가 룰 (내부 코드명, IP 등) | 위반 시 approval_required + diff highlight |

`RedactionRule` 신규 schema 제안:

```ts
// packages/protocol — 향후 추가 시
export type RedactionRule = {
  id: string;
  scope: "pre_send" | "post_receive" | "pre_store" | "pre_backup" | "pre_share";
  patternKind: "secret_key" | "bearer_token" | "env_assignment" | "pem_block" | "pii_email" | "pii_phone" | "pii_ssn" | "internal_codename" | "ipv4" | "custom_regex";
  patternRegex?: string;      // when patternKind === "custom_regex"
  replacement: string;         // default "<redacted>"
  blockOnMatch: boolean;       // true → 발견 시 거부 / false → 치환만
  appliedToTrustLevels: ProviderTrustLevel[]; // 어떤 provider trust에서 적용할지
};
```

별도 PR에서 추가 (이 spec PR은 docs only).

## 6. 적용 위치 (구현 가이드)

각 endpoint가 호출해야 할 helper.

### 6.1 server `/provider-completions` (이미 있는 endpoint)
- step 2: `buildPermissionEvaluationContext({ action: "provider_completion", actor: derivedFromSource(request.source), sourceTrust: derivedFromProfile(providerProfileId), requestedLevels: ["network_access"], costEstimateTokens: estimate(request.messages) })`
- step 3: `evaluatePermission(ctx, policy)` — server 시작 시 정책 로드
- step 6: Pre-send + Post-receive redaction
- step 8: PermissionMatrixItem event emit (sessionId, decision, reason)

### 6.2 server `/remote-runs`
- 이미 `approvalState` 사용. 통합 흐름으로 옮기면 `approvalState` → `PermissionDecision`으로 mapping + `PermissionMatrixItem` emit.

### 6.3 server (신규) `/approvals/grant`, `/approvals/reject`
- mobile/desktop이 approval response 보내는 endpoint. ApprovalQueueItem state 전이.

### 6.4 desktop `stage12DgxProvider.ts` (provider 호출 래퍼)
- 호출 전 server에 permission 위임 (위 6.1과 같은 패턴, server 측에서 처리).

### 6.5 mobile (apps/mobile)
- `/approvals` listing UI (현재 더보기 탭 안에)
- pending approval에 대한 swipe-to-approve/reject 액션

### 6.6 future `/tmux-dispatch`
- step 2의 action은 `terminal_run`. dangerous-command pattern 매칭 시 `run_dangerous_commands` level 요구 → policy matrix상 `approval_required`.

### 6.7 future `/ingress/external`, `/ingress/api`
- IngressGuardResult 7단계 (shape_unification / noise_filter / self_response_prevention / debounce / pii_secret_block / guard_logging / checklist_injection) 통과 후
- 통과한 event를 ctx로 변환 → evaluator → 정책상 거의 다 approval_required (untrusted source)

## 7. 모바일 승인 UX

mobile PWA의 **⋯ 더보기** 탭에 이미 자리 잡힌 "핸드오프"와 별도로 **승인 큐** 추가:

```
⋯ 더보기 / 승인 큐 (N)
┌────────────────────────────┐
│ 🔴 외부 메일 발송           │
│ Tracy → ABC상사 견적 메일   │
│ provider_apifun_claude 응답  │
│ ────────────────           │
│ [내용 미리보기]             │
│ [승인]  [거절]  [수정]      │
└────────────────────────────┘
```

- swipe right → 승인 (햅틱)
- swipe left → 거절
- 탭 → detail view (전체 payload + 정책 결정 reason)
- "수정"은 풀-에디터 후 재제출 (action 다시 evaluate)

push notification (iOS PWA는 16.4+ 제한적) 또는 external bot으로 알림 — 어느 쪽이든 server `/approvals/notify` endpoint가 보냄.

## 8. Trust level 통합

`SourceTrust` (`packages/protocol` `event_source_trust`)와 `ProviderTrustLevel` 둘 다 evaluator 입력:

| 조합 | Memory recall | Provider 호출 |
|---|---|---|
| sourceTrust=trusted, providerTrust=trusted | 전체 | allow |
| sourceTrust=trusted, providerTrust=untrusted (reseller) | summary only — full recall 차단 | allow (단 사용자가 inline warning 봤음) |
| sourceTrust=untrusted, providerTrust=trusted | 차단 | approval_required |
| sourceTrust=untrusted, providerTrust=untrusted | 차단 | deny |

이게 사용자 #6 ("Secret/OAuth 상태 표시")와 연결: provider registry UI에 각 provider의 trustLevel + secretAvailability + 이 매트릭스 결과를 한 줄로 보여주면 사용자가 "이 SOUL을 이 provider로 부를 때 어떤 권한 흐름이 일어나는지" 한눈에 봄.

## 9. 사용자 #4 (Provider budget / timeout guard)

현재 adapter 옵션:
- `AnthropicAdapter.defaultMaxTokens` (default 4096)
- `OpenAICompatibleAdapter.maxTokens` (default 512)
- `OllamaAdapter.defaultNumPredict` (default 512)
- `AdapterRuntimeContext.timeoutMs`

빠진 것:
- **response size cap** — provider가 응답을 무한히 흘려도 server가 받아주는 한계
- **session-level token budget** — 한 세션이 누적 N 토큰 넘으면 approval_required로 강등
- **provider-level monthly budget** — APIKey.fun, Codex OAuth 등 quota 추적

이 셋이 permission evaluator의 `costEstimateTokens` + policy의 budget threshold로 결합. 별도 PR에서 추가하되, 이 spec이 ground truth.

## 10. 우선순위 (코덱스 후속 구현 가이드)

| 단계 | 작업 | 의존 |
|---|---|---|
| F1 | `packages/protocol`에 `RedactionRule` schema 추가 | spec 합의 |
| F2 | server에 `evaluatePermission(ctx, policy)` 순수 함수 + 시작 정책 매트릭스 hardcode | F1 |
| F3 | server `/provider-completions` + `/remote-runs`에 evaluator 통합 + PermissionMatrixItem event emit | F2 |
| F4 | server `/approvals/grant`, `/approvals/reject`, `/approvals/list` endpoint 추가 | F3 |
| F5 | mobile **승인 큐** 탭 추가 + swipe 액션 | F4 |
| F6 | desktop 승인 drawer (대화창에서 inline 표시 대신 별도 panel) | F4 |
| F7 | Redaction rule pipeline 5단계 server 통합 | F1 + F3 |
| F8 | Provider budget guard (token cost estimate + session/monthly threshold) | F3 |
| F9 | Ingress receiver (External Ingress / mobile webhook) + IngressGuardResult 7단계 | F4 + F7 |
| F10 | tmux dispatch는 F1~F8 다 통과한 뒤 진입 | 전부 |

**tmux는 F10**. 사용자 메시지 그대로 — "tmux 전에 해야 할" 작업이 F1~F9이고, 그게 거의 다 permission/redaction 흐름이 깔리는 것.

## 11. 결정 필요 (코덱스/사용자 합의 요청)

1. **정책 매트릭스 위치**: hardcoded TS object vs JSON config 파일 vs DGX server DB row. (Claude 추천: hardcoded TS로 시작, 운영하면서 자주 바뀌면 JSON 파일로 옮김)
2. **approval TTL**: 기본 만료 시간. (Claude 추천: 24시간. external_message_send 같은 high-stakes는 1시간으로 짧게)
3. **2FA 메커니즘**: 모바일 push + 코드 vs external bot inline button. (Claude 추천: 모바일 PWA + external 둘 다 보내고 어느 쪽이든 응답 받으면 grant)
4. **PermissionMatrixItem 영속화**: Event Storage에 저장 (replay 가능) vs 별도 audit log. (Claude 추천: Event Storage — 한 ground truth 유지)
5. **untrusted source의 memory recall 정책**: 완전 차단 vs summary only (보안 vs 사용성). (Claude 추천: summary only — 완전 차단은 답변 품질 큰 타격)
6. **Redaction 위반 처리**: 자동 치환 vs 거부. scope 별로 다름. (Claude 추천 — pre_send/post_receive: 치환, pre_store/pre_backup: 거부, pre_share: approval_required로 강등)

## 12. 이 spec이 닫지 않는 것

- 실제 코드 (이 PR은 docs only). 구현은 코덱스 F1~F10 PR.
- LLM의 출력 자체에 대한 content moderation (provider측 책임).
- 사용자 자신에 대한 권한 격리 — 이 시스템은 single-user 가정. 멀티 사용자는 별도.

## 13. Open questions

- Permission evaluator를 LLM에 위임할지 (예: "이 action이 user 의도에 맞나?" 검사) — 향후. 현재는 deterministic rules only.
- 자연어 정책 정의 ("내가 자고 있을 때는 모든 external_send 거절") — 위와 같이 향후.
- ERP같은 도메인 시스템 진입 후 추가될 actions — `account_create`, `inventory_update`, `payroll_run` 등은 `unknown_external_effect` → 명시 등록 필요.
