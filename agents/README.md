# Agent Profile Files

이 디렉터리는 AI Orchestrator Lab이 OpenClaw 방식과 비슷하게 불러올 수 있는 에이전트별 기본 프로필 파일을 둔다.

현재는 기본 지휘자 프로필만 제공한다.

```text
agents/
  orchestrator/
    AGENTS.md
    SOUL.md
```

앱 내부에서는 구조화된 `AgentProfile`과 persona 설정으로 관리하고, 파일 기반 설정을 선택하면 이 Markdown 파일을 prompt assembly의 입력으로 사용할 수 있다.

중요한 규칙:

- `SOUL.md`는 말투, 판단 기준, 장기 성향을 다룬다.
- `AGENTS.md`는 운영 규칙, 권한 경계, 산출물 형식을 다룬다.
- 두 파일은 동시에 저장할 수 있지만 한 번의 실행에는 `internal`, `markdown`, `off` 중 하나의 설정 소스만 주입한다.
- API key, bearer token, OAuth token, `.env` 값은 이 파일에 쓰지 않는다.

