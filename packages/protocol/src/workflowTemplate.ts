import { z } from "zod";
import {
  missionAgentRoleSchema,
  type MissionAgentRole,
  type MissionCreateRequest,
  type MissionWorkerAssignmentRequest,
} from "./productKernel.js";

/**
 * Workflow Templates — 이 시스템이 코딩만 하는 게 아니라 회사 업무(GIOLITE 영업/조사/
 * 샘플)에도 바로 쓰이게 하는 데이터 프리셋. UI가 아니라 protocol 데이터로 먼저 정의한다.
 *
 * 핵심 페르소나 조직도 147명이 아니라 **4~6명**으로 시작한다. 권한은 캐릭터가 아니라
 * capability/SandboxRunner가 결정한다(companion은 write 권한이 있어도 직접 mutate 금지,
 * builder만 sandbox_build, verifier는 검증만·write 금지).
 */

export const workflowDomainSchema = z.enum(["coding", "sales", "research", "sample", "claim"]);
export type WorkflowDomain = z.infer<typeof workflowDomainSchema>;

export const workflowInputFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "select", "textarea"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
});
export type WorkflowInputField = z.infer<typeof workflowInputFieldSchema>;

export const workflowTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: workflowDomainSchema,
  inputFields: z.array(workflowInputFieldSchema),
  defaultAgents: z.array(missionAgentRoleSchema),
  missionPlan: z.array(z.string()),
  verificationPlan: z.array(z.string()),
  outputArtifacts: z.array(z.string()),
});
export type WorkflowTemplate = z.infer<typeof workflowTemplateSchema>;

const field = (key: string, label: string, type: WorkflowInputField["type"] = "text", required = true): WorkflowInputField => ({
  key,
  label,
  type,
  required,
  options: undefined,
});

/** 템플릿 1 — HTV 견적 워크플로우 */
export const GIOLITE_HTV_QUOTE_TEMPLATE: WorkflowTemplate = {
  id: "giolite_htv_quote",
  title: "HTV 견적",
  domain: "sales",
  inputFields: [
    field("productType", "제품 종류"),
    field("material", "소재"),
    field("quantity", "수량", "number"),
    field("size", "사이즈"),
    field("color", "색상"),
    field("leadTime", "납기"),
    field("incoterms", "인코텀"),
    field("customerRequest", "고객 요청 원문", "textarea", false),
  ],
  defaultAgents: ["orchestrator", "negotiator", "risk_officer", "reviewer"],
  missionPlan: ["요청 파싱·결측 정보 확인", "원가·견적 산출", "리스크·납기 점검", "견적 표·메일 초안 작성"],
  verificationPlan: ["견적 표 항목 누락 없음", "수량·단가 합계 검산"],
  outputArtifacts: ["견적 표", "확인 질문", "외부 발송 메일 초안", "내부 Slack 요청문"],
};

/** 템플릿 2 — 반사소재 시장조사 */
export const GIOLITE_MATERIAL_RESEARCH_TEMPLATE: WorkflowTemplate = {
  id: "giolite_material_research",
  title: "반사소재 시장조사",
  domain: "research",
  inputFields: [
    field("market", "국가/시장"),
    field("productCategory", "제품군"),
    field("competitors", "경쟁사", "textarea", false),
    field("objective", "조사 목적", "textarea"),
  ],
  defaultAgents: ["researcher", "domain_expert", "risk_officer", "mediator"],
  missionPlan: ["광역 탐색·출처 수집", "도메인 심층·경쟁사 비교", "리스크·가격/스펙 점검", "종합·영업 액션 제안"],
  verificationPlan: ["출처 신뢰도 점검", "가격/스펙 수치 교차 확인"],
  outputArtifacts: ["시장 요약", "경쟁사 비교", "가격/스펙 체크리스트", "영업 액션 제안"],
};

/** 템플릿 3 — 샘플 요청 */
export const GIOLITE_SAMPLE_REQUEST_TEMPLATE: WorkflowTemplate = {
  id: "giolite_sample_request",
  title: "샘플 요청",
  domain: "sample",
  inputFields: [
    field("account", "거래처"),
    field("item", "아이템"),
    field("sampleQuantity", "샘플 수량", "number"),
    field("spec", "요구 스펙", "textarea"),
    field("leadTime", "납기"),
    field("shipping", "배송 방식"),
  ],
  defaultAgents: ["orchestrator", "reviewer"],
  missionPlan: ["요청 정보 확인·결측 점검", "샘플 요청서 작성", "내부 공유·스레드 생성"],
  verificationPlan: ["요청서 필수 항목 누락 없음"],
  outputArtifacts: ["샘플 요청서", "Slack 메시지", "진행 스레드", "누락 정보 체크"],
};

export const GIOLITE_WORKFLOW_TEMPLATES: ReadonlyArray<WorkflowTemplate> = [
  GIOLITE_HTV_QUOTE_TEMPLATE,
  GIOLITE_MATERIAL_RESEARCH_TEMPLATE,
  GIOLITE_SAMPLE_REQUEST_TEMPLATE,
];

// ── 핵심 페르소나 조직 (4~6명) ───────────────────────────────────────────────

/** capability가 결정하는 쓰기 정책 — 캐릭터가 아니라 역할/SandboxRunner가 권한을 정한다. */
export type HermesWritePolicy =
  | "no_direct_mutation" // companion: write 권한 있어도 직접 mutate 안 함
  | "sandbox_build_only" // builder: sandbox 안에서만 변경
  | "verify_no_write" // verifier: 검증만, write 금지
  | "merge_recommend"
  | "research"
  | "memory_curate";

export type HermesOrgMember = {
  slot: string;
  role: MissionAgentRole;
  characterDirection: string;
  function: string;
  writePolicy: HermesWritePolicy;
};

export const CORE_HERMES_ORG: ReadonlyArray<HermesOrgMember> = [
  { slot: "lead_companion", role: "companion", characterDirection: "쿠루미 — 사용자 전속 OS", function: "mission 생성·지휘·사용자 대화", writePolicy: "no_direct_mutation" },
  { slot: "builder", role: "builder", characterDirection: "치노 — 빠른 구현", function: "sandbox_build, patch 작성", writePolicy: "sandbox_build_only" },
  { slot: "verifier", role: "verifier", characterDirection: "리제 — 냉정한 감사", function: "sandbox_verify, edge case, error card", writePolicy: "verify_no_write" },
  { slot: "mediator", role: "mediator", characterDirection: "코코아 — 조율자", function: "충돌 정리, final decision", writePolicy: "merge_recommend" },
  { slot: "sales_ops", role: "external", characterDirection: "GIO — 회사 업무", function: "견적, 샘플, 거래처 대응", writePolicy: "research" },
  { slot: "memory_curator", role: "memory_curator", characterDirection: "기억 관리자", function: "skill archive, prune, Obsidian export", writePolicy: "memory_curate" },
];

// ── Template → Mission (L7 live wiring) ──────────────────────────────────────
// 업무 템플릿을 "문서 생성"이 아니라 실제 Mission으로 만든다. 외부 발송은 절대 하지
// 않고 산출물은 planned draft로만 남긴다(truthStatus: planned).

export const missionFromTemplateRequestSchema = z.object({
  templateId: z.string().min(1).max(128),
  input: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  /** 서버가 안 주면 호출 측이 생성 */
  missionId: z.string().min(1).max(128).optional(),
  createdBy: z.string().max(64).optional(),
});
export type MissionFromTemplateRequest = z.infer<typeof missionFromTemplateRequestSchema>;

export function findWorkflowTemplate(templateId: string): WorkflowTemplate | undefined {
  return GIOLITE_WORKFLOW_TEMPLATES.find((template) => template.id === templateId);
}

/** 누락된 필수 입력 필드 키들(빈 문자열도 누락으로 본다). */
export function missingRequiredFields(
  template: WorkflowTemplate,
  input: Record<string, string | number>,
): string[] {
  return template.inputFields
    .filter((field_) => field_.required)
    .filter((field_) => {
      const value = input[field_.key];
      return value === undefined || (typeof value === "string" && value.trim() === "");
    })
    .map((field_) => field_.key);
}

const ROLE_LABEL: Partial<Record<MissionAgentRole, string>> = {
  orchestrator: "지휘자",
  negotiator: "협상·견적",
  risk_officer: "리스크",
  reviewer: "검토자",
  researcher: "리서처",
  domain_expert: "도메인 전문가",
  mediator: "조율자",
  builder: "빌더",
  verifier: "검증자",
  companion: "동행자",
  external: "외부 업무",
  memory_curator: "기억 관리자",
};

/**
 * 템플릿 + 입력 → MissionCreateRequest. defaultAgents를 워커로, missionPlan/
 * verificationPlan/outputArtifacts를 goal에 정직하게 풀어쓴다. capability는 서버가
 * 역할에서 재계산하므로 여기서는 프로필 사실만 싣는다.
 */
export function buildMissionCreateFromTemplate(
  template: WorkflowTemplate,
  input: Record<string, string | number>,
  opts: { missionId: string; createdBy?: string },
): MissionCreateRequest {
  const workers: MissionWorkerAssignmentRequest[] = template.defaultAgents.map((role, index) => ({
    agentId: `${template.id}_${role}_${index + 1}`,
    role,
    displayName: ROLE_LABEL[role] ?? role,
    soulMode: "summary",
    configSource: "internal",
  }));
  const summaryLine = template.inputFields
    .map((field_) => {
      const value = input[field_.key];
      return value === undefined || value === "" ? null : `${field_.label}: ${value}`;
    })
    .filter((line): line is string => line !== null)
    .join(" · ");
  const title = `${template.title}${summaryLine ? ` — ${summaryLine}` : ""}`.slice(0, 300);
  const goal = [
    `[${template.title}] 워크플로우 미션`,
    summaryLine ? `입력 — ${summaryLine}` : "",
    `계획 — ${template.missionPlan.join(" → ")}`,
    `검증 — ${template.verificationPlan.join(", ")}`,
    `산출물(초안) — ${template.outputArtifacts.join(", ")}`,
    "외부 발송 금지 — draft만 생성한다.",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
  return {
    id: opts.missionId,
    title,
    goal,
    truthStatus: "planned",
    createdBy: opts.createdBy ?? "workflow_template",
    workers,
  };
}

/**
 * 템플릿의 outputArtifacts를 planned 아티팩트 참조로 만든다(전부 truthStatus: planned —
 * 실제 산출물이 아니라 "만들 예정"). 외부 발송 없음 — draft만.
 */
export function plannedArtifactsFromTemplate(
  template: WorkflowTemplate,
  missionId: string,
  now: () => string,
): Array<{ id: string; missionId: string; kind: "markdown_report"; summary: string; truthStatus: "planned"; createdAt: string }> {
  return template.outputArtifacts.map((name, index) => ({
    id: `artifact_${missionId}_plan_${index + 1}`,
    missionId,
    kind: "markdown_report" as const,
    summary: `${name} (초안 예정)`,
    truthStatus: "planned" as const,
    createdAt: now(),
  }));
}
