# 프로바이더 프로파일

## 목표

프로바이더 프로파일은 모델 실행에 필요한 설정 묶음이다. 사용자는 여러 프로파일을 동시에 등록하고, 작업마다 다른 프로파일과 모델을 선택할 수 있어야 한다.

## 프로파일 필드

```ts
export type ProviderProfile = {
  id: string;
  name: string;
  kind: "openai" | "anthropic" | "openrouter" | "ollama" | "lmstudio" | "custom";
  baseUrl?: string;
  secretRef?: SecretRef;
  authHeader?: string;
  modelDiscoveryEndpoint?: string;
  defaultModel?: string;
  trustLevel: "trusted" | "limited" | "untrusted";
  enabled: boolean;
  tags: string[];
};

export type SecretRef = {
  providerProfileId: string;
  secretKey: "apiKey" | "authToken";
  storage: "macos-keychain" | "session-memory" | "dgx-vault";
};
```

## API 키 입력 흐름

1. 사용자가 API 키 또는 환경변수 블록을 붙여넣는다.
2. 앱이 형식을 자동 감지한다.
3. base URL, token, provider kind를 추출한다.
4. token은 Event Store에 저장하지 않고 secret storage에 저장한다.
5. 프로파일에는 `secretRef`만 남긴다.
6. 사용자가 `모델 불러오기`를 누른다.
7. 앱이 `/models` 또는 provider별 모델 조회 API를 호출한다.
8. 사용 가능한 모델 목록을 보여준다.
9. 사용자가 기본 모델과 검증 모델을 고른다.

## 지원해야 하는 입력 형식

### 단순 API 키

```text
sk-...
```

### OpenAI 호환 환경변수

```bash
export OPENAI_BASE_URL="https://example.com/v1"
export OPENAI_API_KEY="sk-..."
```

### Anthropic/Claude Code 리셀러 형식

```bash
export ANTHROPIC_BASE_URL="https://api.example.com"
export ANTHROPIC_AUTH_TOKEN="sk-..."
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### PowerShell 형식

```powershell
$env:ANTHROPIC_BASE_URL="https://api.example.com"
$env:ANTHROPIC_AUTH_TOKEN="sk-..."
```

### VSCode Claude Code 설정 형식

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-...",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

## 모델 조회 전략

| 종류 | 조회 방식 |
| --- | --- |
| OpenAI 호환 | `GET /v1/models` |
| OpenRouter | `GET https://openrouter.ai/api/v1/models` |
| Anthropic | 공식 모델 목록 또는 호환 프록시의 `/v1/models` 시도 |
| Ollama | `GET /api/tags` |
| LM Studio | `GET /v1/models` |
| Custom | 사용자가 endpoint 직접 지정 |

## Provider Trust

프로바이더마다 신뢰도를 둔다.

| trustLevel | 대상 | 기본 정책 |
| --- | --- | --- |
| trusted | 공식 API, 로컬 Ollama/LM Studio | 일반 실행과 memory recall 허용 |
| limited | 검증된 호환 API, 사용자가 신뢰한 사설 서버 | 민감 메모리 recall은 사용자 확인 후 허용 |
| untrusted | 리셀러, 출처 불명 base URL, 임시 프록시 | User/Project Memory 자동 전달 차단 |

리셀러/커스텀 base URL은 편의 기능이지만, 프롬프트와 메모리가 외부 프록시에 기록될 수 있다. 앱은 사용자가 해당 프로파일을 만들 때 경고를 표시하고, 기본값을 `limited` 또는 `untrusted`로 둔다.

## 보안 원칙

- 키는 평문으로 로그에 남기지 않는다.
- 키는 Event Store에 저장하지 않고 secret reference만 저장한다.
- UI에는 마지막 몇 글자만 표시한다.
- 사용자가 임시/1회용 키라고 표시하면 세션 종료 시 자동 삭제 옵션을 제공한다.
- 리셀러 키도 정식 프로파일처럼 취급하되, base URL과 헤더 이름을 명확히 표시한다.
- 붙여넣은 원문 환경변수 블록은 event emit 전 Redaction Layer를 통과한다.
- `untrusted` provider에는 장기 memory recall을 자동 주입하지 않는다.

## Agent Binding UI

- Provider Profiles 패널은 독립 스크롤 영역으로 둔다.
- provider는 추가/삭제할 수 있지만, agent가 점유 중인 provider는 삭제할 수 없다.
- agent 선택 영역에서는 등록된 provider 중 하나를 선택할 수 있다.
- 다른 agent가 이미 점유한 provider는 선택 목록에서 비활성화한다.
- provider가 부족한 상태에서 agent를 추가하면 credential pending 상태로 만들고, 사용자가 provider를 추가한 뒤 연결한다.
## Stage10 구현 경계

Stage10에서는 실제 네트워크 호출 전에 credential parser와 mock model discovery를 먼저 연결한다.

- 단순 API key, shell `export`, PowerShell `$env:`, VSCode/Claude Code `settings.json`의 `env` 블록을 파싱한다.
- 원문 키는 반환하지 않고 `SecretRef.redactedPreview`만 ProviderProfile에 남긴다.
- custom base URL과 리셀러 endpoint는 기본 `untrusted`로 표시하고 민감 메모리 자동 recall을 막는 경고를 붙인다.
- `discoverModelsForProfile`은 아직 원격 `/models`를 호출하지 않고 provider kind/trust level 기반의 stub model list를 만든다.
- 데스크톱 Provider Profiles 패널의 refresh 버튼은 discovery snapshot을 만들고, agent model selector가 그 결과를 바로 사용한다.

실제 OS Keychain 저장, DGX secret vault, 원격 model discovery HTTP 호출은 다음 단계에서 붙인다.

## Stage11 구현 경계

Stage11에서는 실제 OS Keychain/DGX vault 저장 전에, 앱 내부가 참조할 secret vault/readiness 모델을 먼저 고정한다.

- `SecretVaultSnapshot`은 provider별 secretRef의 storage, availability, transient 여부를 기록한다.
- `rawSecretPersisted`는 항상 `false`로 둔다. Event Store와 UI에는 원문 key/token을 넣지 않는다.
- `ProviderRuntimeReadiness`는 선택 provider가 지금 completion을 실행할 수 있는지, untrusted라 approval이 필요한지, 자동 memory recall이 가능한지를 계산한다.
- 데스크톱 하단 dock의 Provider Vault 카드는 secret availability, model count, memory mode, readiness reason을 보여준다.
- `check` 버튼은 `secret.vault.checked`, `provider.runtime.readiness.checked` 이벤트만 남기고 실제 secret 조회나 모델 호출은 하지 않는다.

다음 단계에서 이 readiness를 실제 provider completion 호출 직전 gate로 연결한다.
