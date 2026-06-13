# 81 — Live Wiring L7: Workflow Template → Mission 생성 API

GIOLITE 워크플로우 템플릿(PR7)은 protocol 데이터로만 있었다. L7은 그걸 **실제 Mission**으로
만든다. 업무 템플릿은 "문서 생성"이 아니라 mission이 되어야 한다. UI는 나중, 먼저 API.

```
POST /missions/from-template { templateId, input }
  → findWorkflowTemplate (없으면 404)
  → missingRequiredFields (누락 시 400 + 필드 목록)
  → buildMissionCreateFromTemplate → store.create (workers from defaultAgents)
  → plannedArtifactsFromTemplate → mission.artifact.attached (truthStatus: planned)
  → 201 { mission, plannedArtifacts, missionPlan, verificationPlan }
```

## 한 일

- **protocol**: `missionFromTemplateRequestSchema`, `findWorkflowTemplate`,
  `missingRequiredFields`(빈 문자열도 누락), `buildMissionCreateFromTemplate`(defaultAgents →
  워커, missionPlan/verificationPlan/outputArtifacts를 goal에 정직하게 풀어씀, truthStatus
  planned), `plannedArtifactsFromTemplate`(outputArtifacts → planned 아티팩트 초안).
- **route**: `POST /missions/from-template` — 템플릿 검증 → mission 생성 → planned 아티팩트
  attach. capability는 서버가 역할에서 재계산(클라이언트 권한 주장 무시).

## 정직성/안전 불변식 (테스트로 못박음)

- **외부 발송 절대 금지** — 산출물은 planned draft 아티팩트로만(메일/Slack 발송 없음). goal에
  "외부 발송 금지" 명시.
- **truthStatus planned** — 실측 0건이므로 observed/configured 아님(가짜 green 없음).
- 필수 입력 누락 → 400 + 정확한 필드 목록. 미지정 템플릿 → 404.
- defaultAgents → 워커, 권한은 capability가 결정(companion이 mutate 못 함은 그대로).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| template id valid → mission created | ✅ 201 |
| missing required field → 400 + 필드 목록 | ✅ missingFields |
| default agents assigned → worker events | ✅ defaultAgents 매핑 |
| output artifacts planned | ✅ planned 아티팩트 attach |
| source truth: planned not observed | ✅ truthStatus planned |
| no external send → draft only | ✅ goal 명시 + 아티팩트 planned |

## 검증

protocol 75(+4) · server 227(+3) 그린, typecheck 그린. docs/81.
