# 88 — 회사(EXAMPLE_DOMAIN) 템플릿 삭제 (docs/87 격리 → 완전 제거)

사용자 직접 지시로 회사 업무 템플릿을 **격리(docs/87)에서 완전 삭제**로 전환. 제품 코어는
Coding+Design OS만 남는다. Template→Mission 엔진(L7)은 그대로 유지된다.

## 한 일

- `packages/protocol/src/domainPacks/businessTemplates.ts` **삭제**(EXAMPLE_DOMAIN HTV/조사/샘플 +
  `BUSINESS_DOMAIN_PACK_TEMPLATES`). 빈 `domainPacks/` 디렉터리 제거.
- barrel(`index.ts`)에서 business pack export 제거.
- 라우트: `ORCHESTRATOR_ENABLE_DOMAIN_PACK_BUSINESS` env 게이트 + 팩 머지 로직 제거 →
  `from-template`은 `CORE_WORKFLOW_TEMPLATES`(generic)만 조회. 회사 id는 그냥 404(없음).
- `ROLE_LABEL`에서 팩 전용 라벨(negotiator/risk_officer 등) 정리.
- 테스트: 격리 테스트 → "회사 템플릿은 어떤 id로도 도달 불가" 테스트로 교체. 코어 registry에
  회사 문자열 없음 유지.
- smoke step 0 라벨 `quarantined` → `removed`. generic app-build smoke **18/18 PASS** 유지.

## 결과

- 제품에 회사 템플릿/회사명/영업 도메인 코드 **0**(소스·기본 경로·smoke 전부).
- L7 Template→Mission 엔진 + 코어 generic 8템플릿은 그대로.
- protocol·server·desktop 그린, smoke 18/18.

(docs/87의 "격리" 결정은 이 문서로 대체된다 — 격리가 아니라 삭제.)
