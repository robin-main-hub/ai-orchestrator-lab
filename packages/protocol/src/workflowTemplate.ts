import { z } from "zod";
import {
  missionAgentRoleSchema,
  type MissionAgentRole,
  type MissionCreateRequest,
  type MissionWorkerAssignmentRequest,
} from "./productKernel.js";

/**
 * Workflow Templates — 이 시스템이 코딩만 하는 게 아니라 회사 업무(EXAMPLE_DOMAIN 영업/조사/
 * 샘플)에도 바로 쓰이게 하는 데이터 프리셋. UI가 아니라 protocol 데이터로 먼저 정의한다.
 *
 * 핵심 페르소나 조직도 147명이 아니라 **4~6명**으로 시작한다. 권한은 캐릭터가 아니라
 * capability/SandboxRunner가 결정한다(companion은 write 권한이 있어도 직접 mutate 금지,
 * builder만 sandbox_build, verifier는 검증만·write 금지).
 */

export const workflowDomainSchema = z.enum(["coding", "design", "sales", "research", "sample", "claim"]);
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

// ── Core templates: Generic App / Design Builder (회사 도메인 없음) ───────────
// 제품 코어 기본값. 모두 코딩/디자인 generic — 회사명/업무 문자열 0. 권한은 capability가
// 결정하므로 새 AgentRole을 만들지 않고 기존 역할만 쓴다.

export const TEMPLATE_REACT_VITE_APP: WorkflowTemplate = {
  id: "react_vite_app",
  title: "React + Vite 앱",
  domain: "coding",
  inputFields: [field("appName", "앱 이름"), field("description", "한 줄 설명", "textarea", false)],
  defaultAgents: ["architect", "builder", "verifier"],
  missionPlan: ["구조 설계·스캐폴드", "컴포넌트 구현", "타입체크·빌드 검증"],
  verificationPlan: ["pnpm typecheck", "pnpm build"],
  outputArtifacts: ["Vite 스캐폴드", "App.tsx", "README"],
};

export const TEMPLATE_DASHBOARD_SCREEN: WorkflowTemplate = {
  id: "dashboard_screen",
  title: "대시보드 화면",
  domain: "design",
  inputFields: [field("title", "화면 제목"), field("metrics", "핵심 지표", "textarea", false)],
  defaultAgents: ["architect", "builder", "reviewer"],
  missionPlan: ["정보 위계·레이아웃", "카드/차트 구현", "빈 화면·오류 상태"],
  verificationPlan: ["pnpm typecheck", "반응형·overflow 점검"],
  outputArtifacts: ["대시보드 화면", "빈 상태", "오류 상태"],
};

export const TEMPLATE_CHAT_WORKSPACE: WorkflowTemplate = {
  id: "chat_workspace",
  title: "채팅 워크스페이스",
  domain: "coding",
  inputFields: [field("title", "워크스페이스 제목")],
  defaultAgents: ["builder", "reviewer", "verifier"],
  missionPlan: ["메시지 리스트·컴포저", "스크롤·상태 관리", "타입체크 검증"],
  verificationPlan: ["pnpm typecheck"],
  outputArtifacts: ["채팅 뷰", "컴포저", "빈 상태"],
};

export const TEMPLATE_MISSION_BOARD: WorkflowTemplate = {
  id: "mission_board",
  title: "미션 보드",
  domain: "design",
  inputFields: [field("title", "보드 제목")],
  defaultAgents: ["architect", "builder", "reviewer"],
  missionPlan: ["컬럼 구조", "카드·상태 칩", "동선·빈/오류 상태"],
  verificationPlan: ["pnpm typecheck", "키보드 동선 점검"],
  outputArtifacts: ["보드 화면", "카드", "빈 상태"],
};

export const TEMPLATE_SETTINGS_PAGE: WorkflowTemplate = {
  id: "settings_page",
  title: "설정 페이지",
  domain: "design",
  inputFields: [field("title", "페이지 제목")],
  defaultAgents: ["builder", "auditor", "verifier"],
  missionPlan: ["폼 구조", "구현", "접근성·검증(키보드·대비·aria)"],
  verificationPlan: ["pnpm typecheck", "접근성 점검"],
  outputArtifacts: ["설정 폼", "오류 상태", "접근성 노트"],
};

export const TEMPLATE_LANDING_PAGE: WorkflowTemplate = {
  id: "landing_page",
  title: "랜딩 페이지",
  domain: "design",
  inputFields: [field("title", "제품/프로젝트 이름"), field("valueProp", "핵심 가치", "textarea", false)],
  defaultAgents: ["architect", "builder", "reviewer"],
  missionPlan: ["섹션 구조·히어로", "구현", "반응형·동선 검토"],
  verificationPlan: ["pnpm typecheck", "반응형 점검"],
  outputArtifacts: ["랜딩 화면", "히어로", "CTA"],
};

export const TEMPLATE_KANBAN_BOARD: WorkflowTemplate = {
  id: "kanban_board",
  title: "칸반 보드",
  domain: "coding",
  inputFields: [field("title", "보드 제목")],
  defaultAgents: ["architect", "builder", "verifier"],
  missionPlan: ["컬럼·카드 모델", "드래그/상태 관리", "타입체크 검증"],
  verificationPlan: ["pnpm typecheck"],
  outputArtifacts: ["칸반 화면", "카드", "빈 상태"],
};

export const TEMPLATE_DESIGN_SYSTEM_STARTER: WorkflowTemplate = {
  id: "design_system_starter",
  title: "디자인 시스템 스타터",
  domain: "design",
  inputFields: [field("name", "시스템 이름"), field("tone", "톤", "text", false)],
  defaultAgents: ["architect", "builder", "auditor"],
  missionPlan: ["토큰(색/타이포/간격)", "기본 컴포넌트", "대비·접근성 점검"],
  verificationPlan: ["pnpm typecheck", "대비·접근성 점검"],
  outputArtifacts: ["디자인 토큰", "기본 컴포넌트", "접근성 노트"],
};

/**
 * 코어 기본 registry — Generic App/Design Builder 템플릿만. 회사/업무 도메인 팩은
 * 여기에 없다(domainPacks/businessTemplates.ts에 격리, env 플래그로만 노출).
 */
export const CORE_WORKFLOW_TEMPLATES: ReadonlyArray<WorkflowTemplate> = [
  TEMPLATE_REACT_VITE_APP,
  TEMPLATE_DASHBOARD_SCREEN,
  TEMPLATE_CHAT_WORKSPACE,
  TEMPLATE_MISSION_BOARD,
  TEMPLATE_SETTINGS_PAGE,
  TEMPLATE_LANDING_PAGE,
  TEMPLATE_KANBAN_BOARD,
  TEMPLATE_DESIGN_SYSTEM_STARTER,
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
  { slot: "sales_ops", role: "external", characterDirection: "domain — 회사 업무", function: "견적, 샘플, 거래처 대응", writePolicy: "research" },
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

/**
 * 템플릿 조회 — 기본 registry는 코어(generic)뿐. 회사/업무 도메인 팩은 호출 측이
 * 명시적으로 합친 registry를 넘길 때만 보인다(env 플래그 게이트 → 격리).
 */
export function findWorkflowTemplate(
  templateId: string,
  registry: ReadonlyArray<WorkflowTemplate> = CORE_WORKFLOW_TEMPLATES,
): WorkflowTemplate | undefined {
  return registry.find((template) => template.id === templateId);
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
  architect: "설계자",
  reviewer: "검토자",
  auditor: "접근성 감사",
  mediator: "조율자",
  builder: "빌더",
  verifier: "검증자",
  companion: "동행자",
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
