# 84 — DesignBlueprint primitive (Coding/Design OS D3)

"디자인시킬 때도 완성도 높은 프로그램"을 위해, 디자인을 **구조화된 Mission 입력**으로
만든다. "예쁘게 해줘"가 아니라 화면/주요액션/빈화면/오류상태/접근성 기준을 먼저 구조화한다.

```
DesignBlueprint(화면·토큰·수용기준)
  → POST /missions/from-blueprint
  → DESIGN_TEAM 배정된 디자인 Mission + 화면별 planned 아티팩트
```

## 한 일

- **protocol** `designBlueprint.ts`(스키마만 — zod/truthStatus만 import해 순환 회피):
  `DesignBlueprint`(targetSurface/screens{purpose,primaryAction,emptyState,errorState,...}/
  designTokens{density,tone,motion}/acceptanceCriteria), `finalizeDesignBlueprint`(화면 id 부여),
  `plannedArtifactsFromBlueprint`(화면+수용기준 → planned 아티팩트).
- **protocol** `designMission.ts`(빌더 — designBlueprint+productKernel를 import; productKernel은
  designMission을 import 안 해 순환 없음): `DESIGN_TEAM`(companion/architect/builder/reviewer/
  auditor/verifier — **회사 역할 0**), `buildMissionCreateFromBlueprint`.
- **server**: `mission.design.blueprint.recorded` 이벤트 + `ServerMissionRecord.designBlueprints`
  materialize, `store.attachDesignBlueprint`(청사진+화면 planned 아티팩트 기록),
  `POST /missions/from-blueprint`, trace에 `design.blueprint.recorded` 매핑.

## 디자인 캐릭터 (회사 업무 없음)

| 역할 | 기능 |
| --- | --- |
| Lead Companion (companion) | 사용자 의도 해석·최종 조율 |
| Product Designer (architect) | 화면 구조·정보 위계 |
| Frontend Builder (builder) | React/Tailwind 구현 (sandbox_build) |
| Interaction Critic (reviewer) | 동선·상태·빈화면·오류상태 검토 |
| Accessibility Auditor (auditor) | 키보드·대비·aria·reduced motion |
| Verifier (verifier) | 테스트·빌드·visual QA (검증만) |

→ "디자인도 토론"할 수 있는 팀. 권한은 캐릭터가 아니라 capability가 결정.

## 불변식

- 청사진은 **truthStatus planned** — 구현/관측 아님. 화면 아티팩트도 planned(초안 예정).
- 외부 발송 없음 — 시안/구현 draft만.
- 회사 도메인/회사명 하드코딩 0 (generic 디자인 표면만: conversation/dashboard/cockpit/...).
- 재시작 후 복원(이벤트 소싱) — 테스트로 확인.

## 검증

protocol 81(+4) · server 235(+4) · desktop typecheck 그린. docs/84.
