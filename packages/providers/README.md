# Providers Package

모델 프로바이더별 어댑터를 둡니다.

## 대상

- OpenAI 호환 API
- Anthropic
- OpenRouter
- Ollama
- LM Studio
- 리셀러/커스텀 base URL

## 공통 기능

- 모델 목록 조회
- 채팅/응답 호출
- 스트리밍
- 토큰/비용 추정
- 오류 정규화
- API 키/환경변수 파싱

## 현재 구현

- `ProviderAdapter` 인터페이스
- 실제 네트워크 호출이 없는 `MockProviderAdapter`
- 원문 키를 저장하지 않는 `SecretRef` 생성 helper
## Stage10

- `parseProviderCredentialInput`: plain key, shell export, PowerShell env, Claude Code JSON env block을 `SecretRef` 중심 profile metadata로 변환한다.
- `createProviderProfileFromCredentialInput`: 원문 secret 없이 ProviderProfile을 만든다.
- `discoverModelsForProfile`: 실제 `/models` 호출 전 단계의 mock discovery snapshot을 만든다.

## Stage11

- `createSecretVaultSnapshot`: provider profile의 secretRef를 session/keychain/DGX vault 상태로 모델링한다.
- `createProviderRuntimeReadiness`: 선택 provider가 completion 직전 단계에서 ready/approval/credential_required/blocked 중 어디인지 계산한다.
## Stage12

- `DGX-02 vLLM`을 `dgx/vllm/no-auth` 태그를 가진 trusted provider로 모델링한다.
- `discoverModelsForProfile`은 DGX/vLLM provider에 대해 `remote_probe` source와 `qwen36-gio-lora-v5-prisma` 모델을 반환한다.
- `createSecretVaultSnapshot`은 DGX no-auth route를 `dgx_vault` available 상태로 다룬다.
- 실제 completion 전송은 `apps/server`의 `/provider-completions` 프록시를 우선 사용하고, 서버가 없을 때만 desktop direct fallback으로 이어진다.

## Claude Code Single Owner Provider

`provider_claude_code_single_owner` is intended for a single owner's personal research/development use across trusted devices. It must not be used to route requests from other users or shared company services through a personal Claude account. Only one active Claude Code task may run at a time.

Required server guards:

- `ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER=true` must be set before the provider can run.
- `CLAUDE_CODE_OWNER_USER_ID` must identify the only allowed owner.
- `requestContext.userId` must match `CLAUDE_CODE_OWNER_USER_ID`.
- shared route types such as `shared`, `slack_bot`, `company_webapp`, `multi_user_openclaw`, `public_api`, and `scheduled_batch` are blocked.
- trusted remote devices are allowed only when the authenticated owner is the caller.
- the adapter rejects concurrent Claude Code CLI work with a single-active-session lock.
