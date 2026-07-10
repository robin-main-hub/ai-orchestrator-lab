import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import type { OrchestrationMaturityReport } from "./orchestrationMaturity";
import type { SettingsDiagnostics } from "./settingsDiagnostics";
import type { WorkTraceSearchItem } from "./workTraceSearch";

export type ExperienceRoadmapStatus = "live" | "next" | "blocked";

export type ExperienceRoadmapItem = {
  id: string;
  label: string;
  detail: string;
  source: "arc" | "cline" | "cursor" | "linear" | "notion" | "raycast" | "warp" | "v0";
  status: ExperienceRoadmapStatus;
};

export type ExperienceRoadmapInput = {
  diagnostics: SettingsDiagnostics;
  maturity: OrchestrationMaturityReport;
  snapshot: OperatorCockpitSnapshot;
  workTraceItems?: WorkTraceSearchItem[];
};

export function createExperienceRoadmap({
  diagnostics,
  maturity,
  snapshot,
  workTraceItems = [],
}: ExperienceRoadmapInput): ExperienceRoadmapItem[] {
  const readyMaturityIds = new Set(maturity.items.filter((item) => item.status === "ready").map((item) => item.id));
  const blockedMaturityIds = new Set(maturity.items.filter((item) => item.status === "blocked").map((item) => item.id));
  const hasWorkingFleet = snapshot.fleet.some((worker) => worker.status === "working");
  const hasApprovals = snapshot.approvals.length > 0;
  const hasHandoffs = snapshot.handoffs.some((handoff) => handoff.nextAction || handoff.missingInfoSlots.length > 0);
  const hasMemoryWarnings = snapshot.memory.contradictionWarnings.length > 0 || snapshot.memory.dgxMirrorHealth !== "healthy";
  const hasReceipts = workTraceItems.length > 0;
  const hasUnsafeReceipts = workTraceItems.some((item) => !item.searchable);
  const diagnosticsBlocked = diagnostics.status === "blocked";

  return [
    item("agent_rooms", "에이전트별 진짜 대화방", "각 캐릭터가 자기 이름, 기억, 스킬, 모델 경로를 가진 연속 대화방으로 작동", "notion", readyMaturityIds.has("06_memory_curator") ? "live" : "next"),
    item("thinking_trace", "생각/도구/검증 상태 노출", "대기 중 침묵을 없애고 생각 중·도구 호출·테스트 중 상태를 말풍선과 워커 카드에 표시", "cursor", hasWorkingFleet ? "live" : "next"),
    item("next_action_board", "다음 행동 추천판", "Cockpit이 승인, 차단, 검수, 다음 큰 바위를 계속 제안", "linear", maturity.nextActions.length > 0 || hasApprovals ? "live" : "next"),
    item("receipt_ledger", "브리핑 로그", "PR, 테스트, 실패, 수정, 마스킹 상태가 한 장의 카드로 남음", "cline", hasReceipts ? "live" : "next"),
    item("v0_black_theme", "v0 검은 프리미엄 테마", "Obsidian glass 색감과 낮은 노이즈 원칙을 모든 주요 화면에 유지", "v0", "live"),
    item("worker_gamification", "워커 작업 감각", "일하는 워커만 glow와 활동 상태를 갖고, 완료/막힘/승인 대기가 게임처럼 읽힘", "linear", hasWorkingFleet || snapshot.fleet.length > 0 ? "live" : "next"),
    item("single_loop", "요청→수정→검증→PR→기록 단일 루프", "사용자가 흐름을 잃지 않고 한 화면에서 작업을 끝낼 수 있게 연결", "cursor", readyMaturityIds.has("02_control_queue") && readyMaturityIds.has("07_receipts_search") ? "live" : "next"),
    item("command_grammar", "명령 팔레트 문법", "agent, debate, tmux, memory, approve 명령을 ⌘K에서 verb-first로 호출", "raycast", "next"),
    item("task_graph", "Issue-like 작업 그래프", "대화, 토론, tmux 실행, 승인, 브리핑을 같은 작업 id로 묶음", "linear", hasHandoffs ? "live" : "next"),
    item("debate_provenance", "토론 근거/결정 연결", "claim → critique → decision → patch 흐름을 토론 카드에서 추적", "linear", readyMaturityIds.has("03_debate_to_packet") ? "live" : "next"),
    item("tmux_block_model", "Tmux block log", "pane별 input/output/tool/approval block을 쌓아 실행을 재생 가능하게 만듦", "warp", readyMaturityIds.has("04_tmux_runtime") ? "live" : "next"),
    item("memory_curator", "Memory Curator 영속화", "기억 후보, 승격, 모순 해결, forget 요청을 에이전트별로 기록", "notion", hasMemoryWarnings ? "next" : readyMaturityIds.has("06_memory_curator") ? "live" : "next"),
    item("attachment_pipeline", "첨부 처리 파이프라인", "이미지/문서/텍스트 첨부를 모델 능력과 공개 브리핑에 맞춰 일원화", "cursor", readyMaturityIds.has("08_attachments") ? "live" : "next"),
    item("provider_routing", "모델/공급자 라우팅 감각", "현재 선택 에이전트의 모델, fallback, 신뢰 배지를 한눈에 이해", "linear", readyMaturityIds.has("05_provider_console") ? "live" : "next"),
    item("security_masking", "렌더 직전 보안 마스킹", "토큰, URL, 로컬 경로, 내부 프롬프트가 검색/렌더 직전 다시 가려짐", "cline", hasUnsafeReceipts ? "blocked" : readyMaturityIds.has("07_receipts_search") ? "live" : "next"),
    item("visual_smoke", "시각 스모크/스크린샷 검수", "주요 페이지를 실제 화면 이미지로 검사하고 v0 기준에서 벗어나면 되돌림", "v0", readyMaturityIds.has("10_e2e_smoke") ? "live" : "next"),
    item("workspace_spaces", "프로젝트별 Space", "프로젝트마다 에이전트 세트, 기억 범위, 공급자 정책을 분리", "arc", "next"),
    item("approval_tiers", "위험도별 승인 단계", "저위험 자동, 중위험 확인, 고위험 명시 승인으로 승인 피로를 줄임", "cline", hasApprovals ? "live" : "next"),
    item("agent_tool_skills", "에이전트별 도구/스킬 카드", "선택한 에이전트가 실제 어떤 SOUL/AGENTS/스킬 파일을 쓰는지 표시", "notion", "live"),
    item("production_readiness", "운영 준비 잠금", "설정 진단, provider smoke, 시각 QA, 보안 마스킹을 통과해야 완료로 봄", "linear", diagnosticsBlocked || blockedMaturityIds.size > 0 ? "blocked" : "live"),
  ];
}

function item(
  id: string,
  label: string,
  detail: string,
  source: ExperienceRoadmapItem["source"],
  status: ExperienceRoadmapStatus,
): ExperienceRoadmapItem {
  return { id, label, detail, source, status };
}
