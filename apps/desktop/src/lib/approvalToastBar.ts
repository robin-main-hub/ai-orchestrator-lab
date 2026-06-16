import type { ApprovalQueueItem, PermissionActor } from "@ai-orchestrator/protocol";
import { deriveApprovalEvidence } from "./approvalCommandEvidence";

/**
 * 승인 toast bar(제안1) — 전역 단일 승인 액션 표면. 통합 control queue에서 지금 가장 급한
 * 승인 1건을 골라 화면 하단 고정 바로 보여준다. 대기 항목이 없으면 undefined → 바 숨김.
 *
 * 우선순위: 실행형(터미널/자율실행) 승인 먼저, 그 외 첫 required 항목.
 *
 * 정직성(중요): summary는 명령이 아니라 사람용 라벨이다. 명령은 항목이 **실제 commandPreview를
 * 들고 있을 때만**(터미널/tmux 디스패치) 노출한다. 요약에서 명령을 합성하지 않는다. provider/merge/
 * rollback/secret처럼 명령이 없는 항목은 commandPreview를 비워 둔다. safeFamily는 진짜 명령이
 * safeCommandPolicy 허용 계열일 때만 true — 자동승인 액션이 아니라 읽기 전용 표시다.
 */
export type ApprovalToastBarItem = {
  sourceItemId: string;
  summary: string;
  /** 진짜 명령 미리보기 — 있을 때만(모노스페이스로 표시). 없으면 라벨만 보여준다. */
  commandPreview?: string;
  /** 진짜 명령이 safeCommandPolicy 허용 계열이면 true (읽기 전용 안전 표시) */
  safeFamily?: boolean;
  /**
   * 요청한 동료(에이전트/운영자)의 신원 — 있을 때만. 큐 항목 자체엔 페르소나 이름/역할/모델이
   * 없으므로(requestedBy는 actor enum뿐) App.tsx가 가진 세션의 활성 에이전트 신원을 best-effort로
   * 투영한 값이다. "이 세션에서 활동 중인 에이전트"라는 근사치이지, 큐가 보장하는 hard fact는 아니다.
   * 신원을 모르면 이 필드를 비워 두고(바는 actor 라벨로 정직하게 폴백) 가짜 페르소나를 만들지 않는다.
   */
  requester?: ApprovalToastRequester;
};

/**
 * 승인을 요청한 주체의 표시용 신원. actor는 항상 알 수 있는 hard fact(enum)이고,
 * name/role/model/avatarUrl은 App이 세션 활성 에이전트에서 best-effort로 채운 값이다.
 */
export type ApprovalToastRequester = {
  /** 표시 이름(페르소나/운영자). 비면 actor 라벨로 폴백. */
  name?: string;
  role?: string;
  model?: string;
  avatarUrl?: string;
  /** 항상 정확한 enum 신원 — 정직한 최종 폴백(예: "에이전트"/"운영자"). */
  actor: PermissionActor;
};

/**
 * App.tsx가 주입하는 best-effort 신원 해석기 컨텍스트. 큐 항목→요청 동료 신원 매핑.
 * 큐엔 페르소나 정보가 없으니 "에이전트" 요청이면 세션의 활성 에이전트 신원을, "user" 요청이면
 * 운영자 라벨을 입힌다. 그 외 actor는 enum 라벨로 둔다(정직한 폴백). 모르면 undefined로 두면 된다.
 */
export type ApprovalToastRequesterContext = {
  /** requestedBy==="agent"일 때 입힐 세션 활성 에이전트 신원(best-effort). */
  activeAgent?: { name?: string; role?: string; model?: string; avatarUrl?: string };
  /** requestedBy==="user"일 때 쓸 운영자 표시 이름. 기본값은 바에서 처리. */
  operatorName?: string;
};

/** "실행형" 승인인지 — replayKind=tmux_dispatch(자율실행) 또는 action=terminal_run. 정렬 우선용. */
function isCommandApproval(item: ApprovalQueueItem): boolean {
  return item.replayKind === "tmux_dispatch" || item.action === "terminal_run";
}

/**
 * best-effort 신원 매핑: requestedBy(actor enum) + App이 준 컨텍스트 → 표시용 requester.
 * 가짜 페르소나를 만들지 않는다 — agent인데 활성 에이전트 신원이 없으면 name 없이 actor만 싣고,
 * 바가 "에이전트" 같은 정직한 enum 라벨로 떨어지게 둔다.
 */
function deriveRequester(
  item: ApprovalQueueItem,
  context: ApprovalToastRequesterContext | undefined,
): ApprovalToastRequester {
  const actor = item.requestedBy;
  if (actor === "agent" && context?.activeAgent) {
    const a = context.activeAgent;
    return { actor, name: a.name, role: a.role, model: a.model, avatarUrl: a.avatarUrl };
  }
  if (actor === "user") {
    return { actor, name: context?.operatorName };
  }
  // external_channel/mobile/server 등은 enum 라벨로 정직하게(바에서 actor→라벨 변환).
  return { actor };
}

export function deriveApprovalToastItem(
  queue: ApprovalQueueItem[],
  context?: ApprovalToastRequesterContext,
): ApprovalToastBarItem | undefined {
  const pending = queue.filter((item) => item.state === "required");
  if (pending.length === 0) return undefined;

  // 실행형(터미널/자율실행) 승인을 우선 노출 — 운영자가 바로 판단할 가능성이 높다.
  const target = pending.find(isCommandApproval) ?? pending[0]!;
  const evidence = deriveApprovalEvidence(target);
  const base: ApprovalToastBarItem = {
    sourceItemId: target.sourceItemId,
    summary: target.summary,
    requester: deriveRequester(target, context),
  };
  if (evidence.kind === "command") {
    base.commandPreview = evidence.commandPreview;
    base.safeFamily = evidence.safe.allowed;
  }
  return base;
}
