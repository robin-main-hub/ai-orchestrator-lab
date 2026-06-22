# 73 — EXAMPLE_DOMAIN workflow templates + 핵심 페르소나 조직 (Orchestration OS PR7)

이 시스템이 코딩만 하는 게 아니라 회사 업무(EXAMPLE_DOMAIN)에도 바로 쓰이게. UI가 아니라
protocol 데이터로 먼저 정의한다.

## WorkflowTemplate (protocol 데이터)

`workflowTemplate.ts`: `WorkflowTemplate`(id/title/domain(coding/sales/research/sample/
claim)/inputFields/defaultAgents(MissionAgentRole)/missionPlan/verificationPlan/
outputArtifacts) + `WorkflowInputField`. 3개 EXAMPLE_DOMAIN 프리셋:
- **HTV 견적**(sales): 제품/소재/수량/사이즈/색상/납기/인코텀/고객요청 → orchestrator·
  negotiator·risk_officer·reviewer → 견적표·확인질문·발송메일·Slack요청문.
- **반사소재 시장조사**(research): 시장/제품군/경쟁사/목적 → researcher·domain_expert·
  risk_officer·mediator → 시장요약·경쟁사비교·가격스펙체크리스트·영업액션.
- **샘플 요청**(sample): 거래처/아이템/수량/스펙/납기/배송 → orchestrator·reviewer →
  샘플요청서·Slack·진행스레드·누락정보체크.

## 핵심 페르소나 조직 (4~6명, capability-bound)

Grok의 147 agent org는 버린다. `CORE_HERMES_ORG`(데이터): 쿠루미/Lead(companion,
no_direct_mutation) · 치노/Builder(sandbox_build_only) · 리제/Verifier(verify_no_write)
· 코코아/Mediator(merge_recommend) · Domain Ops(external, research) · Memory Curator
(memory_curate). **권한은 캐릭터가 아니라 role/capability/SandboxRunner가 결정** —
companion은 write 권한이 있어도 직접 mutate 금지, builder만 sandbox_build, verifier write 금지.

## 설계 선택 (회귀 0)

기존 `defaultAgentProfiles`(18, 개수 불변식 테스트 + agents/<slug>/ 번들 필요)는 건드리지
않고, 조직을 **프리셋 데이터**로 추가 — 로스터 마이그레이션 없이 "권장 4~6 조직"을 표현.
라이브 배선(템플릿→미션 생성 폼, 조직 프리셋→roster 인스턴스화)은 후속.

## 검증

protocol +4(63 그린), 빌드. docs/73.

## 다음

PR8 PWA shell.
