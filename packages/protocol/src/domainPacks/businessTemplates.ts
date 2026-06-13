import type { WorkflowTemplate } from "../workflowTemplate.js";

/**
 * Business domain pack — **optional, NOT a core product default**. 제품 코어는 Coding+
 * Design Orchestration OS이고, 회사 업무/영업 템플릿은 여기로 격리한다. 삭제하지 않는다
 * (Template→Mission 엔진은 그대로 재사용 가능) — 다만 기본 `/missions/from-template`
 * registry에는 들어가지 않고, `ORCHESTRATOR_ENABLE_DOMAIN_PACK_BUSINESS=1`일 때만 노출된다.
 *
 * 기본 UI/기본 smoke/기본 테스트 경로에는 이 파일의 회사명·업무 문자열이 나오지 않는다.
 */

export const GIOLITE_HTV_QUOTE_TEMPLATE: WorkflowTemplate = {
  id: "giolite_htv_quote",
  title: "HTV 견적",
  domain: "sales",
  inputFields: [
    { key: "productType", label: "제품 종류", type: "text", required: true, options: undefined },
    { key: "material", label: "소재", type: "text", required: true, options: undefined },
    { key: "quantity", label: "수량", type: "number", required: true, options: undefined },
    { key: "size", label: "사이즈", type: "text", required: true, options: undefined },
    { key: "color", label: "색상", type: "text", required: true, options: undefined },
    { key: "leadTime", label: "납기", type: "text", required: true, options: undefined },
    { key: "incoterms", label: "인코텀", type: "text", required: true, options: undefined },
    { key: "customerRequest", label: "고객 요청 원문", type: "textarea", required: false, options: undefined },
  ],
  defaultAgents: ["orchestrator", "negotiator", "risk_officer", "reviewer"],
  missionPlan: ["요청 파싱·결측 정보 확인", "원가·견적 산출", "리스크·납기 점검", "견적 표·메일 초안 작성"],
  verificationPlan: ["견적 표 항목 누락 없음", "수량·단가 합계 검산"],
  outputArtifacts: ["견적 표", "확인 질문", "외부 발송 메일 초안", "내부 Slack 요청문"],
};

export const GIOLITE_MATERIAL_RESEARCH_TEMPLATE: WorkflowTemplate = {
  id: "giolite_material_research",
  title: "반사소재 시장조사",
  domain: "research",
  inputFields: [
    { key: "market", label: "국가/시장", type: "text", required: true, options: undefined },
    { key: "productCategory", label: "제품군", type: "text", required: true, options: undefined },
    { key: "competitors", label: "경쟁사", type: "textarea", required: false, options: undefined },
    { key: "objective", label: "조사 목적", type: "textarea", required: true, options: undefined },
  ],
  defaultAgents: ["researcher", "domain_expert", "risk_officer", "mediator"],
  missionPlan: ["광역 탐색·출처 수집", "도메인 심층·경쟁사 비교", "리스크·가격/스펙 점검", "종합·영업 액션 제안"],
  verificationPlan: ["출처 신뢰도 점검", "가격/스펙 수치 교차 확인"],
  outputArtifacts: ["시장 요약", "경쟁사 비교", "가격/스펙 체크리스트", "영업 액션 제안"],
};

export const GIOLITE_SAMPLE_REQUEST_TEMPLATE: WorkflowTemplate = {
  id: "giolite_sample_request",
  title: "샘플 요청",
  domain: "sample",
  inputFields: [
    { key: "account", label: "거래처", type: "text", required: true, options: undefined },
    { key: "item", label: "아이템", type: "text", required: true, options: undefined },
    { key: "sampleQuantity", label: "샘플 수량", type: "number", required: true, options: undefined },
    { key: "spec", label: "요구 스펙", type: "textarea", required: true, options: undefined },
    { key: "leadTime", label: "납기", type: "text", required: true, options: undefined },
    { key: "shipping", label: "배송 방식", type: "text", required: true, options: undefined },
  ],
  defaultAgents: ["orchestrator", "reviewer"],
  missionPlan: ["요청 정보 확인·결측 점검", "샘플 요청서 작성", "내부 공유·스레드 생성"],
  verificationPlan: ["요청서 필수 항목 누락 없음"],
  outputArtifacts: ["샘플 요청서", "Slack 메시지", "진행 스레드", "누락 정보 체크"],
};

/** 격리된 회사 업무 도메인 팩 — 기본 registry에 들어가지 않는다(env 플래그로만 합쳐짐). */
export const BUSINESS_DOMAIN_PACK_TEMPLATES: ReadonlyArray<WorkflowTemplate> = [
  GIOLITE_HTV_QUOTE_TEMPLATE,
  GIOLITE_MATERIAL_RESEARCH_TEMPLATE,
  GIOLITE_SAMPLE_REQUEST_TEMPLATE,
];
