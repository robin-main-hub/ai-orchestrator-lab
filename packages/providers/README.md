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
