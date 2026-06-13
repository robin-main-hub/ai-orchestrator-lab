# 87 — L7 보정: 회사 템플릿 격리 + Generic App/Design 코어 registry

새 방향(Coding+Design OS) 기준으로 L7의 보정. **엔진은 유지, 회사 도메인 템플릿만 코어
기본값에서 격리(삭제 아님)**. 같은 Template→Mission 엔진을 generic 앱/디자인 중심으로 재배치.

## 한 일

- **격리**: EXAMPLE_DOMAIN(HTV 견적/반사소재 조사/샘플 요청)를 `packages/protocol/src/domainPacks/
  businessTemplates.ts`로 이동. `BUSINESS_DOMAIN_PACK_TEMPLATES`로만 export — **코어 기본
  registry에 없음**. 삭제하지 않았다(엔진 재사용 가능).
- **Generic 코어 registry** `CORE_WORKFLOW_TEMPLATES` 8종(회사 문자열·도메인 0):
  `react_vite_app · dashboard_screen · chat_workspace · mission_board · settings_page ·
  landing_page · kanban_board · design_system_starter`. domain enum에 `design` 추가, 새
  AgentRole은 0(기존 architect/builder/reviewer/auditor/verifier만).
- **격리 게이트**: `findWorkflowTemplate(id, registry=CORE)`. `POST /missions/from-template`은
  기본 코어만 조회 → 회사 템플릿은 **404**. `ORCHESTRATOR_ENABLE_DOMAIN_PACK_BUSINESS=1`일
  때만 팩을 합친 registry로 노출(나중에 회사 업무 다시 붙일 때 구조 재사용).
- **기본 smoke를 generic app build로 교체**: `smoke-orchestration-os.mjs`가 이제 (0) 회사
  템플릿 404 확인 → (1) `react_vite_app` 템플릿으로 미션 생성 → AppWorkspace attach →
  preview probe(dev 서버 미기동이라 **not observed** 확인) → checkpoint → verify fail(error
  card+self-correction) → verify pass → merge real sha → skill candidate → kanban/trace →
  restart restore. **18/18 PASS**(회사 문자열 0).

## 정직성/중립성 불변식 (테스트로 못박음)

- 코어 registry에 `example-domain/HTV/견적/샘플/거래처` 문자열·`sales/research/sample` 도메인 **0**.
- 기본 `findWorkflowTemplate("example-domain_htv_quote")` → undefined(격리). 명시적으로 합친
  registry에서만 보임.
- 라우트 기본 = 코어만. 회사 템플릿 = env 플래그 게이트(격리, 삭제 아님).
- preview는 dev 서버 없으면 observed 아님(가짜 running 금지) — 스모크가 확인.

## 유지(보정 아님)

L1~L6, L8 Live Wiring 그대로. Template→Mission API 그대로. Skill candidate는 코딩/디자인에서도
유효(타입오류 fix·레이아웃 overflow 해결·preview 진단 패턴). Self-correction은 여전히 제안만.

## 검증

protocol 87(+3) · server 242(+1) · desktop typecheck 그린 · generic app-build smoke 18/18 PASS.
docs/87.
