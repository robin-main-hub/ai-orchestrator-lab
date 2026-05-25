# Agent Profile Files

이 디렉터리는 AI Orchestrator Lab이 OpenClaw 방식과 비슷하게 불러올 수 있는 에이전트별 기본 프로필 파일을 둔다.

```text
agents/
  orchestrator/      # 중앙 지휘자 (대화 → 토론 → 결정 → 코딩 패킷 → 실행 흐름 조립)
    AGENTS.md
    SOUL.md
  architect/         # 시스템 구조 설계, 모듈 경계, ADR
    AGENTS.md
    SOUL.md
  reviewer/          # 변경의 합격/조건부 합격/거부, 명세-구현 일치 검사
    AGENTS.md
    SOUL.md
  skeptic/           # 의도적 반대 의견, 가정 도전, 실패 시나리오
    AGENTS.md
    SOUL.md
  verifier/          # 측정 가능한 합격 기준, 재현 가능한 검증 절차
    AGENTS.md
    SOUL.md
  memory_curator/    # 기억할 것/잊을 것 분류, 영속화 위치 결정
    AGENTS.md
    SOUL.md
```

앱 내부에서는 구조화된 `AgentProfile`과 persona 설정으로 관리하고, 파일 기반 설정을 선택하면 이 Markdown 파일을 prompt assembly의 입력으로 사용할 수 있다.

## 디자인 원칙

5개 비-orchestrator 페르소나는 debate engine이 한 라운드 안에서 호출할 수 있는 표준 역할군이다. 각자의 voice / 판단 방식 / 산출물 형식은 다르지만, 안전 경계 (Permission Matrix, secret 금기, DGX-01 금기, untrusted source 격리)는 동일하다. 새 페르소나를 추가할 때도 같은 안전 절을 그대로 따른다.

페르소나 선택 가이드:

| 상황 | 호출 페르소나 |
|---|---|
| 새 layer를 추가하거나 인터페이스를 바꿔야 할 때 | architect |
| PR / spec / 결정의 일관성을 검사할 때 | reviewer |
| 합의가 너무 빨리 형성됐다고 느낄 때 | skeptic |
| "이게 실제 작동하는가"를 측정 가능한 기준으로 닫을 때 | verifier |
| 정보의 영속화 / 폐기 결정 | memory_curator |
| 전체 흐름을 잇거나 페르소나간 결과를 합칠 때 | orchestrator |

토론 1라운드에 모든 페르소나가 다 필요한 건 아니다. orchestrator가 상황에 따라 2~4명 호출하는 것이 보통.

## 파일 규칙

- `SOUL.md`는 말투, 판단 기준, 장기 성향을 다룬다.
- `AGENTS.md`는 운영 규칙, 권한 경계, 산출물 형식을 다룬다.
- 두 파일은 동시에 저장할 수 있지만 한 번의 실행에는 `internal`, `markdown`, `off` 중 하나의 설정 소스만 주입한다.
- API key, bearer token, OAuth token, `.env` 값은 이 파일에 쓰지 않는다.
- 페르소나 간 contradictions (예: architect가 reviewer 영역을 침범)이 발견되면 README에 정책을 추가하고 SOUL/AGENTS를 수정한다. 두 페르소나가 같은 결정을 둘 다 내리는 것은 안전한 중복이지만, 같은 형식의 산출물을 둘 다 내는 것은 비효율.

