import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  Edit3,
  Forward,
  HelpCircle,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  X,
  XCircle,
} from "lucide-react";
import type {
  ApprovalQueueItem,
  PermissionMatrixSnapshot,
} from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import {
  controlQueueActionFeedback,
  controlQueueLaneLabel,
  controlQueueMetaItems,
  controlQueuePermissionLabel,
  sanitizeControlQueueText,
  controlQueueStateLabel,
  type ControlQueueLaneId,
} from "@/lib/controlQueuePresentation";
import { isRiskyApprovalItem } from "../lib/controlQueueRisk";
import { partitionSafeSubset } from "../lib/approvalCommandEvidence";
import { tmuxRedispatchOutcomeLabel } from "../lib/railStatusLabels";
import type { TmuxRedispatchOutcome } from "./OperationsRailPanel";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";

/**
 * Control Queue drawer — v0 visual language port.
 *
 * v0 의 `debate/assistant-inbox.tsx` 는 bottom strip 형태. 우리
 * Control Queue 는 ⌘⇧A 로 호출되는 **오른쪽 슬라이드 drawer** 라서
 * v0 mockup 의 직접 대응이 없음. 하지만:
 *   - design-decisions §1 의 Control Queue + 6 lane vocabulary 는 우리만의 결정
 *   - design-decisions §6 의 ⌘⇧A shortcut 도 우리만의 결정
 *   - v0 는 bottom strip 으로만 표현했지 keyboard 호출 가능한 overlay
 *     drawer 는 안 만듬
 *
 * 이번 port 는 layout 은 우리의 right-slide drawer 를 유지하되,
 * **visual language 를 v0 그대로** (Tailwind utility + Button primitive
 * + bg-card / border-border / text-foreground 등) 로 통일.
 *
 * v0 mockup 의 bottom AssistantInbox 자리는 ConversationWorkbench (PR
 * #144) 의 InboxApprovalStrip 에 이미 구현 — 두 surface 가 같은 데이터
 * (PermissionMatrixSnapshot) 를 다른 진입점으로 노출.
 */

export type ControlQueueDrawerProps = {
  onAsk: (item: ApprovalQueueItem) => void;
  onApprove: (sourceItemId: string) => void;
  onBlock: (item: ApprovalQueueItem) => void;
  onClose: () => void;
  onDelegate: (item: ApprovalQueueItem) => void;
  onEdit: (item: ApprovalQueueItem) => void;
  onReject: (sourceItemId: string) => void;
  open: boolean;
  snapshot: PermissionMatrixSnapshot;
  /** 승인 직후 tmux 재전송 결과 — 승인을 누른 바로 그 자리에서 blocked/실패 사유를 보여준다 */
  redispatchOutcomes?: TmuxRedispatchOutcome[];
  /**
   * 안전 검증 항목 일괄 승인. 지정 시 한 번에 처리(단일 trace 가능), 미지정 시 각 항목을
   * 기존 onApprove로 fan-out한다(각 승인이 이미 개별 trace를 남김).
   */
  onBulkApproveSafe?: (sourceItemIds: string[]) => void;
};

type LaneId = ControlQueueLaneId;

const LANES: Array<{
  id: LaneId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "approve", label: controlQueueLaneLabel("approve"), icon: <Check className="h-3 w-3" /> },
  { id: "ask", label: controlQueueLaneLabel("ask"), icon: <HelpCircle className="h-3 w-3" /> },
  { id: "edit", label: controlQueueLaneLabel("edit"), icon: <Edit3 className="h-3 w-3" /> },
  { id: "delegate", label: controlQueueLaneLabel("delegate"), icon: <Forward className="h-3 w-3" /> },
  { id: "block", label: controlQueueLaneLabel("block"), icon: <ShieldOff className="h-3 w-3" /> },
  { id: "archive", label: controlQueueLaneLabel("archive"), icon: <XCircle className="h-3 w-3" /> },
];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ControlQueueDrawer({
  onAsk,
  onApprove,
  onBlock,
  onClose,
  onDelegate,
  onEdit,
  onReject,
  open,
  snapshot,
  redispatchOutcomes = [],
  onBulkApproveSafe,
}: ControlQueueDrawerProps) {
  const [activeLane, setActiveLane] = useState<LaneId | "all">("all");
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const pendingItems = snapshot.queue.filter((item) => item.state === "required");
  const resolvedCount = snapshot.queue.length - pendingItems.length;
  // 안전 검증 항목(진짜 명령 + safeCommandPolicy 허용 계열)만 일괄 승인 대상. 나머지는 제외.
  const safeSubset = partitionSafeSubset(snapshot.queue);

  const runBulkApproveSafe = () => {
    const ids = safeSubset.approvable.map((item) => item.sourceItemId);
    if (ids.length === 0) return;
    if (onBulkApproveSafe) onBulkApproveSafe(ids);
    else ids.forEach((id) => onApprove(id));
    setBulkConfirming(false);
  };

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function getFocusableElements() {
      const drawer = drawerRef.current;
      if (!drawer) return [];

      return Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
    }

    function focusFirstElement() {
      const first = closeButtonRef.current ?? getFocusableElements()[0] ?? drawerRef.current;
      first?.focus();
    }

    const frame = window.requestAnimationFrame(focusFirstElement);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const drawer = drawerRef.current;
      if (!drawer || !(event.target instanceof Node) || drawer.contains(event.target)) return;
      focusFirstElement();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <aside
      aria-label="작업 큐"
      aria-modal="true"
      className="fixed right-4 top-14 z-30 flex max-h-[calc(100vh-78px)] w-[min(460px,calc(100vw-32px))] flex-col rounded-lg border border-border bg-card shadow-2xl"
      ref={drawerRef}
      role="dialog"
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">작업 큐</span>
          <span className="text-xs text-muted-foreground">
            {pendingItems.length}건 처리 대기
          </span>
          <kbd className="rounded border border-border bg-card/60 px-1 py-0 text-[9px] font-mono text-muted-foreground">
            ⌘⇧A
          </kbd>
        </div>
        <Button
          aria-label="작업 큐 닫기"
          className="h-6 w-6"
          onClick={onClose}
          ref={closeButtonRef}
          size="icon"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="border-b border-border bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(24,24,27,0.45))] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100">
            <Clock3 className="h-3 w-3" />
            처리 지휘판
          </span>
          {/* 완전 자동에선 대기 항목이 사실상 0 — 대기 배지는 실제 대기가 있을 때만 노출한다. */}
          {pendingItems.length > 0 ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-muted-foreground">
              승인 대기 {pendingItems.length}건
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-muted-foreground">
            처리 완료 {resolvedCount}건
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          질문·수정·위임으로 흐름 정리 후, 위험 실행만 운영자 승인으로 통과시킵니다.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1.5 border-b border-border px-3 py-2">
        <SummaryCell label="허용" tone="muted" value={snapshot.summary.allowed} />
        <SummaryCell label="승인됨" tone="success" value={snapshot.summary.approved} />
        <SummaryCell label="거부됨" tone="destructive" value={snapshot.summary.denied} />
      </div>

      {/* 승인 직후 재전송 결과 — 승인이 blocked/실패로 끝나면 그 이유를 여기서 바로 보여준다 */}
      {redispatchOutcomes.length > 0 ? (
        <div aria-label="승인 후 재전송 결과" className="space-y-1 border-b border-border px-3 py-2">
          {redispatchOutcomes.slice(0, 2).map((outcome) => {
            const ok = outcome.status === "sent" || outcome.status === "recorded";
            return (
              <div className="flex items-start gap-2 text-xs" key={`${outcome.approvalId}:${outcome.createdAt}`}>
                <span
                  className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    ok
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                      : "border-red-300/25 bg-red-400/10 text-red-200"
                  }`}
                >
                  {outcome.role} · {tmuxRedispatchOutcomeLabel(outcome.status)}
                </span>
                {outcome.reason ? (
                  <span className="min-w-0 break-all leading-5 text-muted-foreground">{outcome.reason}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Lane chips */}
      <div
        aria-label="처리 방식 필터"
        className="flex flex-wrap gap-1 border-b border-border px-3 py-2"
        role="tablist"
      >
        <LaneChip
          active={activeLane === "all"}
          count={pendingItems.length}
          label="전체"
          onClick={() => setActiveLane("all")}
        />
        {LANES.map((lane) => (
          <LaneChip
            active={activeLane === lane.id}
            icon={lane.icon}
            key={lane.id}
            label={lane.label}
            onClick={() => setActiveLane(lane.id)}
          />
        ))}
      </div>

      {/* 안전 검증 항목 일괄 승인 — "모두 승인"이 아니라 안전 계열만. 제외 개수도 함께 보여준다. */}
      {safeSubset.approvable.length > 0 ? (
        <div aria-label="안전 검증 항목 일괄 승인" className="flex items-center gap-2 border-b border-border bg-emerald-500/[0.06] px-3 py-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">안전 검증 항목 승인</p>
            <p className="text-[10px] text-muted-foreground">
              대상 {safeSubset.approvable.length}개
              {safeSubset.excluded.length > 0 ? ` · 제외 ${safeSubset.excluded.length}개(명령 없음·위험·비실행)` : ""}
            </p>
          </div>
          {bulkConfirming ? (
            <div className="flex shrink-0 items-stretch gap-1">
              <Button
                className="h-7 justify-center gap-1 px-2.5 text-[10px]"
                onClick={runBulkApproveSafe}
                title="안전 계열 명령만 일괄 승인합니다"
                type="button"
                variant="default"
              >
                <Check className="h-3 w-3" />
                {safeSubset.approvable.length}개 승인
              </Button>
              <Button
                className="h-7 justify-center px-2.5 text-[10px]"
                onClick={() => setBulkConfirming(false)}
                type="button"
                variant="outline"
              >
                취소
              </Button>
            </div>
          ) : (
            <Button
              className="h-7 shrink-0 justify-center gap-1 px-2.5 text-[10px]"
              onClick={() => setBulkConfirming(true)}
              title="진짜 명령이 있고 safeCommandPolicy 허용 계열인 항목만 대상입니다"
              type="button"
              variant="outline"
            >
              <ShieldCheck className="h-3 w-3" />
              안전 항목 승인
            </Button>
          )}
        </div>
      ) : null}

      {/* Queue list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {pendingItems.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-card/40 p-4">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-foreground">대기 중인 항목 없음</span>
              {resolvedCount > 0 ? (
                <span className="result-stamp result-stamp-success text-[10px]">처리 완료</span>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {resolvedCount > 0
                ? `${resolvedCount}개 항목은 이미 처리됐습니다.`
                : "위험 실행은 아직 큐에 없습니다."}
            </span>
          </div>
        ) : (
          pendingItems.map((item, index) => (
            <QueueCard
              activeLane={activeLane}
              isFirst={index === 0}
              item={item}
              key={item.id}
              onAsk={onAsk}
              onApprove={onApprove}
              onBlock={onBlock}
              onDelegate={onDelegate}
              onEdit={onEdit}
              onReject={onReject}
            />
          ))
        )}
      </div>

      {/* Footer — 키보드 단축키를 드로어 안에서 보이게 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <FooterKbd>⌘⏎</FooterKbd> 첫 항목 승인
          <FooterKbd>⌘⌫</FooterKbd> 거절
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FooterKbd>esc</FooterKbd> 닫기
        </span>
      </div>
    </aside>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "success" | "destructive";
}) {
  const variant =
    tone === "success" ? "success" : tone === "destructive" ? "danger" : "muted";

  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-border bg-card/40 px-2 py-1.5">
      <StatusBadge variant={variant} size="md" className="font-semibold px-2.5">
        {value}
      </StatusBadge>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function LaneChip({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const variant = label === controlQueueLaneLabel("approve") ? "success"
    : label === controlQueueLaneLabel("ask") ? "primary"
    : label === controlQueueLaneLabel("edit") ? "warning"
    : label === controlQueueLaneLabel("delegate") ? "muted"
    : label === controlQueueLaneLabel("block") ? "danger"
    : label === controlQueueLaneLabel("archive") ? "muted"
    : "default";

  return (
    <button
      aria-selected={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-card/40 text-muted-foreground hover:border-primary/45",
      )}
      onClick={onClick}
      role="tab"
      title={controlQueueActionFeedback(labelToLaneId(label))}
      type="button"
    >
      {icon}
      <StatusBadge variant={variant} size="sm">{label}</StatusBadge>
      {count !== undefined ? (
        <span className="rounded-full bg-primary/20 px-1 text-[9px] text-primary">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function QueueCard({
  activeLane,
  isFirst = false,
  item,
  onAsk,
  onApprove,
  onBlock,
  onDelegate,
  onEdit,
  onReject,
}: {
  activeLane: LaneId | "all";
  /** 큐의 첫 항목인가 — ⌘⏎/⌘⌫ 키보드 경로가 이 항목을 처리하므로 힌트를 보여준다 */
  isFirst?: boolean;
  item: ApprovalQueueItem;
  onAsk: (item: ApprovalQueueItem) => void;
  onApprove: (sourceItemId: string) => void;
  onBlock: (item: ApprovalQueueItem) => void;
  onDelegate: (item: ApprovalQueueItem) => void;
  onEdit: (item: ApprovalQueueItem) => void;
  onReject: (sourceItemId: string) => void;
}) {
  // 액션 피로 완화: 기본은 "승인" 하나만 크게, 나머지 5개는 "더보기"로 접는다.
  const [expanded, setExpanded] = useState(false);
  // 위험 명령은 한 번 더 확인 — 일반 승인과 같은 한 번 클릭으로 통과시키지 않는다.
  const [confirming, setConfirming] = useState(false);
  const risky = isRiskyApprovalItem(item);
  const showAction = (lane: LaneId) => activeLane === "all" || activeLane === lane;
  const collapsed = activeLane === "all" && !expanded;
  const metaItems = controlQueueMetaItems(item);
  const reasonMeta = metaItems.find((meta) => meta.label === "사유");
  const compactMeta = metaItems.filter((meta) => meta.label !== "사유");

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border bg-card/40 p-2",
        risky
          ? "border-destructive/60 bg-destructive/[0.04]"
          : item.state === "required"
            ? "border-warning/50"
            : "border-border",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Clock3 className="h-3 w-3 text-muted-foreground" />
          <span className="truncate text-[10px] font-mono text-muted-foreground">
            {sanitizeControlQueueText(item.requestedBy)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {risky ? (
            <StatusBadge variant="danger" size="sm" className="gap-1 font-mono uppercase">
              <AlertTriangle className="h-3 w-3" />
              위험
            </StatusBadge>
          ) : null}
          <StatusBadge variant="warning" size="sm" className="font-mono uppercase">
            {controlQueueStateLabel(item.state)}
          </StatusBadge>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs font-medium text-foreground line-clamp-2">
        {sanitizeControlQueueText(item.summary)}
      </p>
      <div className="flex flex-wrap gap-1">
        {compactMeta.map((meta) => (
          <StatusBadge
            className="gap-1 font-mono"
            key={meta.label}
            size="sm"
            variant={meta.variant}
          >
            <span className="text-muted-foreground/80">{meta.label}</span>
            {meta.value}
          </StatusBadge>
        ))}
      </div>
      {reasonMeta ? (
        <p className="line-clamp-1 text-[10px] text-muted-foreground" title={reasonMeta.value}>
          <span className="text-muted-foreground/70">사유 </span>
          {reasonMeta.value}
        </p>
      ) : null}
      <p className="text-[10px] text-muted-foreground">
        {item.permissions.map(controlQueuePermissionLabel).join(" · ")}
      </p>
      <p className="text-[9px] font-mono text-muted-foreground">
        {sanitizeControlQueueText(item.sourceItemId)}
      </p>

      {/* 액션. 기본(collapsed)은 승인 한 버튼 + 더보기. 펼치거나 특정 lane 필터 시 6개 전부. */}
      {collapsed ? (
        <div className="flex flex-col gap-1 pt-1">
          {confirming ? (
            <div className="flex items-stretch gap-1">
              <Button
                className="h-8 flex-1 justify-center gap-1.5 text-[11px]"
                onClick={() => {
                  onApprove(item.sourceItemId);
                  setConfirming(false);
                }}
                title="위험 명령을 정말 실행합니다"
                type="button"
                variant="destructive"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                정말 실행?
              </Button>
              <Button
                className="h-8 justify-center px-3 text-[11px]"
                onClick={() => setConfirming(false)}
                type="button"
                variant="outline"
              >
                취소
              </Button>
            </div>
          ) : (
            <Button
              className="h-8 w-full justify-center gap-1.5 text-[11px]"
              onClick={() => (risky ? setConfirming(true) : onApprove(item.sourceItemId))}
              title={risky ? "위험 명령 — 한 번 더 확인합니다" : controlQueueActionFeedback("approve")}
              type="button"
              variant={risky ? "destructive" : "default"}
            >
              <Check className="h-3.5 w-3.5" />
              {controlQueueLaneLabel("approve")}
              {isFirst ? (
                <kbd className="ml-0.5 rounded border border-white/20 bg-black/20 px-1 text-[8px] font-mono leading-tight opacity-80">
                  ⌘⏎
                </kbd>
              ) : null}
            </Button>
          )}
          <button
            aria-expanded={false}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card/40 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
            onClick={() => setExpanded(true)}
            title="질문·수정·위임·차단·보관"
            type="button"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            더보기
          </button>
        </div>
      ) : (
        <>
          <div className={cn("grid gap-1 pt-1", activeLane === "all" ? "grid-cols-3" : "grid-cols-1")}>
            {showAction("approve") ? (
              <ActionButton
                icon={<Check className="h-3 w-3 size-3" />}
                label={controlQueueLaneLabel("approve")}
                onClick={() => onApprove(item.sourceItemId)}
                tone="primary"
              />
            ) : null}
            {showAction("ask") ? (
              <ActionButton
                icon={<HelpCircle className="h-3 w-3 size-3" />}
                label={controlQueueLaneLabel("ask")}
                onClick={() => onAsk(item)}
              />
            ) : null}
            {showAction("edit") ? (
              <ActionButton
                icon={<Edit3 className="h-3 w-3 size-3" />}
                label={controlQueueLaneLabel("edit")}
                onClick={() => onEdit(item)}
              />
            ) : null}
            {showAction("delegate") ? (
              <ActionButton
                icon={<Forward className="h-3 w-3 size-3" />}
                label={controlQueueLaneLabel("delegate")}
                onClick={() => onDelegate(item)}
              />
            ) : null}
            {showAction("block") ? (
              <ActionButton
                icon={<ShieldOff className="h-3 w-3 size-3" />}
                label={controlQueueLaneLabel("block")}
                onClick={() => onBlock(item)}
                tone="destructive"
              />
            ) : null}
            {showAction("archive") ? (
              <ActionButton
                icon={<XCircle className="h-3 w-3 size-3" />}
                label={controlQueueLaneLabel("archive")}
                onClick={() => onReject(item.sourceItemId)}
                tone="destructive"
              />
            ) : null}
          </div>
          {activeLane === "all" ? (
            <button
              aria-expanded
              className="inline-flex items-center justify-center gap-1 rounded-md py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setExpanded(false)}
              type="button"
            >
              접기
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function FooterKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-card/60 px-1 py-0 font-mono text-[9px]">{children}</kbd>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  tone?: "primary" | "destructive";
}) {
  const buttonVariant =
    tone === "primary" ? "default" : tone === "destructive" ? "destructive" : "outline";

  return (
    <Button
      variant={buttonVariant}
      className="h-7 gap-1 px-1.5 text-[10px] font-mono transition-all"
      onClick={onClick}
      title={controlQueueActionFeedback(labelToLaneId(label))}
      type="button"
    >
      {icon}
      {label}
    </Button>
  );
}

function labelToLaneId(label: string): ControlQueueLaneId {
  return LANES.find((lane) => lane.label === label)?.id ?? "ask";
}
