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
  apiKey?: string;
  authHeader?: string;
  modelDiscoveryEndpoint?: string;
  defaultModel?: string;
  enabled: boolean;
  tags: string[];
};
```

## API 키 입력 흐름

1. 사용자가 API 키 또는 환경변수 블록을 붙여넣는다.
2. 앱이 형식을 자동 감지한다.
3. base URL, token, provider kind를 추출한다.
4. 사용자가 `모델 불러오기`를 누른다.
5. 앱이 `/models` 또는 provider별 모델 조회 API를 호출한다.
6. 사용 가능한 모델 목록을 보여준다.
7. 사용자가 기본 모델과 검증 모델을 고른다.

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

## 보안 원칙

- 키는 평문으로 로그에 남기지 않는다.
- UI에는 마지막 몇 글자만 표시한다.
- 사용자가 임시/1회용 키라고 표시하면 세션 종료 시 자동 삭제 옵션을 제공한다.
- 리셀러 키도 정식 프로파일처럼 취급하되, base URL과 헤더 이름을 명확히 표시한다.
