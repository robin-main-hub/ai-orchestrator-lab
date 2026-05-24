# DGX-02 Provider Registry

## 목적

DGX-02의 OpenClaw Slot 2 환경 파일을 원천으로 삼아, 데스크톱 앱에서 여러 provider를 선택할 수 있게 만든다.

원천 키 파일:

```text
/home/robin/openclaws/2/env
```

원문 API key는 Event Storage, UI, Obsidian/Notion export, 테스트 출력에 저장하지 않는다. 앱과 서버는 redacted secret reference와 사용 가능 여부만 다룬다.

## APIKey.fun Claude A/B

| 구분 | Provider ID | 표시 이름 | 기본 모델 | API key env | Base URL |
| --- | --- | --- | --- | --- | --- |
| Claude A | `provider_apifun_claude` | `APIKey.fun Claude A` | `claude-opus-4-6` | `ANTHROPIC_API_KEY` | `https://api.apikey.fun` |
| Claude B | `provider_apifun_claude_b` | `APIKey.fun Claude B` | `claude-opus-4-6` | `ANTHROPIC_API_KEY_ALT` | `https://api.apikey.fun` |

별칭 env:

```text
APIKEYFUN_CLAUDE_A_KEY
APIKEYFUN_CLAUDE_B_KEY
APIKEYFUN_ANTHROPIC_BASE_URL
```

키 원문은 기록하지 않고, registry에는 아래처럼 남긴다.

```text
secretRefPreview: dgx-02:ANTHROPIC_API_KEY
secretRefPreview: dgx-02:ANTHROPIC_API_KEY_ALT
secretSourceRefs: env:ANTHROPIC_API_KEY, file:~/openclaws/2/env
secretSourceRefs: env:ANTHROPIC_API_KEY_ALT, file:~/openclaws/2/env
```

## 현재 Registry 원칙

- DGX-02가 provider registry의 authoritative source다.
- 데스크톱은 `GET /provider-registry`로 provider/profile/model metadata를 가져온다.
- `GET /provider-models?providerProfileId=...`로 모델 목록을 가져오며, APIKey.fun Claude A/B처럼 `/models`가 안정적이지 않은 provider는 static allowlist를 쓴다.
- Gemini CLI는 아직 연결하지 않는다. `agy -p` 설정을 함께 확정한 뒤 등록한다.
- Grok OAuth는 별도 proxy/session provider로 유지하되, 토큰 만료 감지는 별도 단계에서 보강한다.
