# 40 — 페르소나 = 원자적 에이전트 세트

페르소나 주입은 "pane에 떠 있는 기존 Hermes 에이전트에게 텍스트만 갈아끼우는 것"이
아니다. **SOUL/AGENTS 파일 + 선언된 역할(role·권한) + 백킹 Hermes 에이전트 세션**이
한 세트로 함께 움직인다. 새 캐릭터(새 파일) 수준의 교체라면 에이전트 세션도 새로
시작해야 한다 — 이전 캐릭터의 컨텍스트를 상속하지 않도록.

## 동작 (소환 시퀀스)

1. **fresh boot (게이트 통과)** — pane의 에이전트 CLI에 새 세션 명령(기본 `/new`)
   디스패치. 이전 캐릭터의 대화/컨텍스트가 깨끗이 사라진 새 Hermes 세션이 뜬다.
2. **정체성 주입** — 헤더가 "fresh hermes agent session"임과 **선언된 역할·권한**
   (`defaultAgentProfiles`에서 personaName으로 해석)을 함께 명시한 뒤
   SAFETY + SOUL/AGENTS 본문이 주입된다.
3. **킥오프** — 그 역할로 작업 시작.

## 역할이 함께 움직임

- `resolvePersonaAgentSet(personaName)` — 프로필 레지스트리에서 personaName으로
  선언 역할/권한을 찾고, `AGENT_ROLE_TO_PANE_ROLE` 매핑으로 선호 pane 역할 도출
  (예: kurumi(companion)→orchestrator pane, yuno(auditor)→qa pane).
- 병렬 콘솔에서 페르소나 이름을 입력하면 등록된 캐릭터의 pane 역할이 자동 바인딩
  (수동 변경은 여전히 가능).

## 적용 범위 / 옵션

- 단일 자율실행(AutonomyRunContainer): 항상 적용.
- 병렬 콘솔: "새 Hermes 세션 핸드오프" 토글(기본 ON) + 부트 명령 입력(기본 `/new`,
  배포 환경의 CLI에 맞게 변경 가능). 끄면 기존(세션 재사용) 동작.
- 미등록 페르소나도 fresh boot는 동일하게 적용되며, 선언 역할 절만 생략된다.
- 부트 명령 역시 일반 명령과 동일하게 승인·권한·리댁션 게이트를 통과한다.

## 코드

- `apps/desktop/src/lib/personaAgentSet.ts` — 세트 해석 + 헤더 생성 (순수)
- `personaSummonPlan.buildPersonaInjectionPlan` — boot → identity → kickoff 순서
- `personaTaskRunner` / `autonomousRun` / `parallelAutonomy` — agentSet 패스스루

---

# 40b — Hermes 슬롯 풀 (스티키 바인딩)

"매 소환마다 새 세션"은 버려진 세션 기록을 무한 누적시킨다. 대신:

- **스티키 재사용** — 슬롯을 가진 페르소나는 자기 에이전트를 그대로 다시 쓴다
  (히스토리 연속성 유지, 리셋 없음, 신규 세션 기록 없음).
- **여유 슬롯 부착** — 새 페르소나는 여유 슬롯에 바인딩. 한 번도 안 쓴 슬롯이면
  리셋조차 불필요.
- **재활용 리셋** — 해제(release)된 슬롯에 *다른* 캐릭터가 들어올 때만 리셋
  명령(기본 `/new`, 변경 가능)을 게이트 통과로 1회 디스패치.
- **증설** — 여유가 0이 되면 그때 새 Hermes 에이전트 슬롯을 1개 추가. 이후로는
  로스터가 실제로 늘어나는 만큼만 하나씩 증가.

기본 풀: **12 슬롯** (`DEFAULT_HERMES_POOL_SIZE` — 7개 swarm pane 역할 + 병렬
미션/신규 캐릭터 여유분). 바인딩은 localStorage(`ai-orch.hermesSlotPool.v1`)에
영속되어 앱 재시작에도 유지된다. 콘솔 헤더에 "사용 n · 여유 m (총 t)" 표시.

코드: `hermesSlotPool.ts` (순수 상태기계) + `hermesPoolStore.ts` (영속) +
`personaAgentSet.slotId/bootSteps` 통합.
