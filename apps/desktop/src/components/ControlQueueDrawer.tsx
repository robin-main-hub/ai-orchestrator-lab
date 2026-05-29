import { useState, useEffect } from "react";
import {
  Check,
  Clock3,
  Edit3,
  Forward,
  HelpCircle,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  X,
  XCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import type {
  ApprovalQueueItem,
  PermissionMatrixSnapshot,
  WorkItem,
} from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/themes/prism-tomorrow.css";

export type ControlQueueDrawerProps = {
  onApprove: (sourceItemId: string) => void;
  onClose: () => void;
  onReject: (sourceItemId: string) => void;
  open: boolean;
  snapshot: PermissionMatrixSnapshot;
  workItems: WorkItem[];
  onSubmitAction: (workItemId: string, action: string, payload?: any) => Promise<void>;
};

type LaneId = "approve" | "ask" | "edit" | "delegate" | "block" | "archive";

const LANES: Array<{
  id: LaneId;
  label: string;
  icon: React.ReactNode;
  status: "live" | "soon";
}> = [
  { id: "approve", label: "approve", icon: <Check className="h-3 w-3" />, status: "live" },
  { id: "ask", label: "ask", icon: <HelpCircle className="h-3 w-3" />, status: "live" },
  { id: "edit", label: "edit", icon: <Edit3 className="h-3 w-3" />, status: "live" },
  { id: "delegate", label: "delegate", icon: <Forward className="h-3 w-3" />, status: "live" },
  { id: "block", label: "block", icon: <ShieldOff className="h-3 w-3" />, status: "live" },
  { id: "archive", label: "archive", icon: <XCircle className="h-3 w-3" />, status: "live" },
];

type UnionItem =
  | { type: "approval"; id: string; lane: "approve" | "archive"; data: ApprovalQueueItem }
  | { type: "work_item"; id: string; lane: "ask" | "edit" | "delegate" | "block" | "approve" | "archive"; data: WorkItem };

export function ControlQueueDrawer({
  onApprove,
  onClose,
  onReject,
  open,
  snapshot,
  workItems,
  onSubmitAction,
}: ControlQueueDrawerProps) {
  const [activeLane, setActiveLane] = useState<LaneId | "all">("all");

  const pendingItems = snapshot.queue.filter((item) => item.state === "required");

  // 1. 융합 아이템 목록(unionItems) 구성
  const unionItems: UnionItem[] = [
    ...pendingItems.map((item) => ({
      type: "approval" as const,
      id: item.sourceItemId || item.id,
      lane: (item.state === "approved" || item.state === "rejected") ? ("archive" as const) : ("approve" as const),
      data: item,
    })),
    ...workItems.map((item) => {
      let lane: "ask" | "edit" | "delegate" | "block" | "approve" | "archive" = "approve";
      if (item.lane === "ask" || item.status === "waiting_input") {
        lane = "ask";
      } else if (item.lane === "coding" || item.status === "drafted") {
        lane = "edit";
      } else if (item.status === "waiting_approval") {
        lane = "delegate";
      } else if (item.lane === "blocked" || item.status === "blocked") {
        lane = "block";
      } else if (item.status === "done" || item.status === "archived") {
        lane = "archive";
      }
      return {
        type: "work_item" as const,
        id: item.id,
        lane,
        data: item,
      };
    }),
  ];

  // activeLane 필터링 적용 (archive가 아닌 것만 기본 'all'에 노출)
  const filteredItems = unionItems.filter((item) => {
    if (activeLane === "all") {
      return item.lane !== "archive";
    }
    return item.lane === activeLane;
  });

  // 각 레인별 카운트 계산
  const getLaneCount = (laneId: LaneId | "all") => {
    if (laneId === "all") {
      return unionItems.filter((item) => item.lane !== "archive").length;
    }
    return unionItems.filter((item) => item.lane === laneId).length;
  };

  const totalPending = getLaneCount("all");

  if (!open) return null;

  return (
    <aside
      aria-label="Control Queue"
      className="fixed right-4 top-14 z-30 flex max-h-[calc(100vh-78px)] w-[min(460px,calc(100vw-32px))] flex-col rounded-lg border border-border bg-card shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Control Queue</span>
          <span className="text-xs text-muted-foreground">
            {totalPending} pending
          </span>
          <kbd className="rounded border border-border bg-card/60 px-1 py-0 text-[9px] font-mono text-muted-foreground">
            ⌘⇧A
          </kbd>
        </div>
        <Button
          aria-label="Close Control Queue"
          className="h-6 w-6"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1.5 border-b border-border px-3 py-2">
        <SummaryCell label="allow" tone="muted" value={snapshot.summary.allowed} />
        <SummaryCell label="approved" tone="success" value={snapshot.summary.approved} />
        <SummaryCell label="denied" tone="destructive" value={snapshot.summary.denied} />
      </div>

      {/* Lane chips */}
      <div
        aria-label="lane filter"
        className="flex flex-wrap gap-1 border-b border-border px-3 py-2"
        role="tablist"
      >
        <LaneChip
          active={activeLane === "all"}
          count={getLaneCount("all")}
          label="all"
          onClick={() => setActiveLane("all")}
        />
        {LANES.map((lane) => (
          <LaneChip
            active={activeLane === lane.id}
            icon={lane.icon}
            key={lane.id}
            label={lane.label}
            onClick={() => setActiveLane(lane.id)}
            count={getLaneCount(lane.id)}
          />
        ))}
      </div>

      {/* Queue list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3 min-h-0">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-card/40 p-4">
            <Check className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-foreground">
              대기 중인 항목 없음
            </span>
            <span className="text-xs text-muted-foreground">
              선택한 레인에는 대기 중인 자율제어 요청이 없습니다.
            </span>
          </div>
        ) : (
          filteredItems.map((item) => (
            <QueueCard
              item={item}
              key={item.id}
              onApprove={onApprove}
              onReject={onReject}
              onSubmitAction={onSubmitAction}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[10px] text-muted-foreground shrink-0">
        <span className="font-mono">
          {LANES.length} live lanes · Active Autopilot Gate
        </span>
        <kbd className="rounded border border-border bg-card/60 px-1 py-0 font-mono">
          esc
        </kbd>
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
  return (
    <div className="flex flex-col items-center rounded-md border border-border bg-card/40 px-2 py-1.5">
      <span
        className={cn(
          "text-sm font-semibold",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function LaneChip({
  active,
  count,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  disabled?: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const variant = label === "approve" ? "success"
    : label === "ask" ? "primary"
    : label === "edit" ? "warning"
    : label === "delegate" ? "muted"
    : label === "block" ? "danger"
    : label === "archive" ? "muted"
    : "default";

  return (
    <button
      aria-selected={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono transition-colors cursor-pointer",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-card/40 text-muted-foreground hover:border-primary/45",
        disabled && "cursor-not-allowed opacity-40 hover:border-border",
      )}
      disabled={disabled}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {icon}
      <StatusBadge variant={variant} size="sm">{label}</StatusBadge>
      {count !== undefined ? (
        <span className="rounded-full bg-primary/10 px-1 text-[9px] font-semibold text-primary">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function QueueCard({
  item,
  onApprove,
  onReject,
  onSubmitAction,
}: {
  item: UnionItem;
  onApprove: (sourceItemId: string) => void;
  onReject: (sourceItemId: string) => void;
  onSubmitAction: (workItemId: string, action: string, payload?: any) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 개별 폼 입력 상태
  const [askInput, setAskInput] = useState("");
  const [editCode, setEditCode] = useState(() => {
    if (item.type === "work_item") {
      return item.data.summary || "";
    }
    return "";
  });
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("builder");
  const [isDirty, setIsDirty] = useState(false);

  const isWorkItem = item.type === "work_item";
  const itemId = isWorkItem ? item.data.id : item.data.sourceItemId;
  const requestedBy = isWorkItem ? (item.data.ownerAgentId || "orchestrator") : item.data.requestedBy;
  const summary = isWorkItem ? item.data.summary : item.data.summary;
  const title = isWorkItem ? item.data.title : "Permission Request";
  const permissions = isWorkItem ? ["control-gate"] : item.data.permissions;

  const serverSummary = isWorkItem ? item.data.summary || "" : "";

  // Reset inputs and dirtiness when target item changes
  useEffect(() => {
    setIsDirty(false);
    setAskInput("");
    setOverrideReason("");
    setEditCode(serverSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Sync server updates when not dirty
  useEffect(() => {
    if (!isDirty) {
      setEditCode(serverSummary);
    }
  }, [serverSummary, isDirty]);

  const handleAction = async (action: string, payload?: any) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmitAction(itemId, action, payload);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border p-3.5 transition-all duration-300 relative overflow-hidden bg-card/60 backdrop-blur-md",
        isWorkItem 
          ? "border-primary/30 shadow-[0_4px_12px_rgba(59,130,246,0.05)] hover:border-primary/50" 
          : "border-warning/30 hover:border-warning/50",
        item.lane === "block" && "border-destructive/40 bg-destructive/5 shadow-[0_4px_16px_rgba(239,68,68,0.08)] animate-pulse-subtle"
      )}
    >
      {/* Submitting Overlay */}
      {submitting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 backdrop-blur-xs">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="truncate text-[10px] font-mono text-muted-foreground/80 uppercase tracking-wider">
            {requestedBy}
          </span>
        </div>
        <StatusBadge
          variant={
            item.lane === "block" ? "danger"
              : item.lane === "ask" ? "primary"
              : item.lane === "edit" ? "warning"
              : item.lane === "delegate" ? "muted"
              : "success"
          }
          size="sm"
          className="font-mono uppercase shrink-0 px-2 py-0.5"
        >
          {item.lane}
        </StatusBadge>
      </div>

      {/* Title & Summary */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold text-foreground leading-tight tracking-tight">
          {title}
        </h4>
        <p className="text-xs text-muted-foreground/90 whitespace-pre-wrap leading-relaxed bg-background/25 p-2 rounded border border-border/20">
          {summary}
        </p>
      </div>

      {/* Permissions / Tags info */}
      <div className="flex flex-wrap gap-1">
        {permissions.map((p) => (
          <span
            key={p}
            className="rounded bg-muted/40 border border-border/30 px-2 py-0.5 text-[9px] font-mono text-muted-foreground/80"
          >
            {p}
          </span>
        ))}
      </div>

      {/* Error Message Display */}
      {errorMsg && (
        <p className="text-[10px] text-destructive font-medium bg-destructive/10 p-2 rounded border border-destructive/20 animate-pulse">
          오류: {errorMsg}
        </p>
      )}

      {/* ── LANE SPECIFIC INTERACTIVE FORMS ── */}
      <div className="pt-3.5 border-t border-border/20 space-y-3">
        {/* 1. APPROVE 레인 (레거시/실행 승인) */}
        {item.lane === "approve" && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-8 text-xs font-semibold shadow-sm transition-all hover:shadow-primary/20 hover:scale-[1.01]"
              variant="default"
              onClick={() => {
                if (isWorkItem) {
                  handleAction("approve_delegation");
                } else {
                  onApprove(itemId);
                }
              }}
            >
              승인 (Approve)
            </Button>
            <Button
              className="h-8 text-xs font-semibold shadow-sm transition-all hover:scale-[1.01]"
              variant="destructive"
              onClick={() => {
                if (isWorkItem) {
                  handleAction("archive");
                } else {
                  onReject(itemId);
                }
              }}
            >
              반려 (Archive)
            </Button>
          </div>
        )}

        {/* 2. ASK 레인 (답변 대기) */}
        {item.lane === "ask" && (
          <div className="space-y-2.5">
            <textarea
              className="w-full text-xs p-2.5 border border-border bg-background/50 focus:border-primary/80 focus:ring-1 focus:ring-primary/30 focus:outline-hidden rounded-md resize-none h-18 leading-relaxed placeholder:text-muted-foreground/60 transition-all"
              placeholder="여기에 필요한 추가 답변이나 정보를 입력하세요..."
              value={askInput}
              onChange={(e) => {
                setAskInput(e.target.value);
                setIsDirty(true);
              }}
            />
            <Button
              className={cn(
                "w-full h-8 text-xs font-semibold transition-all hover:scale-[1.01]",
                askInput.trim() ? "shadow-[0_0_12px_rgba(59,130,246,0.25)] bg-primary text-primary-foreground hover:bg-primary/95" : "bg-muted text-muted-foreground"
              )}
              disabled={!askInput.trim()}
              onClick={() => handleAction("provide_input", { inputValue: askInput })}
            >
              답변 제출 및 실행 재개
            </Button>
          </div>
        )}

        {/* 3. EDIT 레인 (Draft 편집) */}
        {item.lane === "edit" && (
          <div className="space-y-2.5">
            <span className="text-[9px] font-mono text-muted-foreground/70 block uppercase tracking-wider">
              인라인 초안 에디터 (Draft Editor)
            </span>
            <div className="border border-border/80 rounded-md bg-[#252525] max-h-52 overflow-y-auto focus-within:border-warning/60 focus-within:shadow-[0_0_10px_rgba(245,158,11,0.15)] transition-all">
              <Editor
                value={editCode}
                onValueChange={(code) => {
                  setEditCode(code);
                  setIsDirty(true);
                }}
                highlight={(code) => highlight(code, languages.js as any, "javascript")}
                padding={10}
                style={{
                  fontFamily: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace',
                  fontSize: 10,
                  minHeight: 120,
                  outline: "none",
                }}
                className="w-full text-foreground leading-normal"
              />
            </div>
            <Button
              className="w-full h-8 text-xs font-semibold bg-warning hover:bg-warning/90 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)] text-warning-foreground transition-all hover:scale-[1.01]"
              onClick={() => handleAction("edit_payload", { editedContent: editCode })}
            >
              수정 사항 저장 및 승인
            </Button>
          </div>
        )}

        {/* 4. DELEGATE 레인 (위임 선택) */}
        {item.lane === "delegate" && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 justify-between">
              <span className="text-[10px] text-muted-foreground/80 font-semibold uppercase tracking-wider">
                위임 대상 에이전트:
              </span>
              <div className="relative">
                <select
                  className="appearance-none bg-background/60 hover:bg-background/80 border border-border/80 rounded-md px-3 py-1 text-xs font-mono pr-7 cursor-pointer focus:outline-hidden focus:border-primary transition-all duration-200"
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                >
                  <option value="builder">Builder Agent</option>
                  <option value="reviewer">Reviewer Agent</option>
                  <option value="architect">Architect Agent</option>
                  <option value="expert">Expert Agent</option>
                </select>
                <ChevronDown className="h-3 w-3 absolute right-2.5 top-2 pointer-events-none text-muted-foreground/60" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                className="h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 hover:shadow-[0_0_12px_rgba(59,130,246,0.25)] transition-all hover:scale-[1.01]"
                onClick={() =>
                  handleAction("approve_delegation", { delegationTarget: selectedAgent })
                }
              >
                위임 승인
              </Button>
              <Button
                className="h-8 text-xs font-semibold hover:bg-muted/80 transition-all hover:scale-[1.01]"
                variant="outline"
                onClick={() => handleAction("archive")}
              >
                반려
              </Button>
            </div>
          </div>
        )}

        {/* 5. BLOCK 레인 (보안 차단 및 강제 우회) */}
        {item.lane === "block" && (
          <div className="space-y-2.5">
            {isWorkItem && (item.data as any).metadata?.actionRequired === "approve_redacted_memory" ? (
              <div className="space-y-2.5 animate-in fade-in duration-200">
                <div className="rounded bg-warning/10 p-3 border-l-4 border-warning shadow-sm">
                  <span className="text-[10px] text-warning font-bold flex items-center gap-1.5 tracking-wider uppercase">
                    <ShieldAlert className="h-4 w-4" /> 비밀정보 검출 승인 대기
                  </span>
                  <p className="text-[9px] text-muted-foreground/90 mt-1 leading-relaxed">
                    저장하려는 기억 후보에 민감한 정보가 포함되어 있습니다. 마스킹(Redact)하여 안전하게 저장하거나 파기해 주십시오.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    className="h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 hover:shadow-[0_0_12px_rgba(59,130,246,0.25)] transition-all hover:scale-[1.01]"
                    onClick={() => handleAction("redact_and_save")}
                  >
                    마스킹 후 저장
                  </Button>
                  <Button
                    className="h-8 text-xs font-semibold hover:bg-muted/80 transition-all hover:scale-[1.01]"
                    variant="outline"
                    onClick={() => handleAction("discard_redacted_memory")}
                  >
                    기억 파기 (Discard)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="rounded bg-destructive/10 p-3 border-l-4 border-destructive shadow-sm">
                  <span className="text-[10px] text-destructive font-bold flex items-center gap-1.5 tracking-wider uppercase">
                    <ShieldOff className="h-4 w-4" /> SECURITY ALERT · POLICY VIOLATION
                  </span>
                  <p className="text-[9px] text-muted-foreground/90 mt-1 leading-relaxed">
                    보안 규칙 위배 또는 예외가 감지되어 에이전트 작동이 자동 차단되었습니다. 계속하려면 우회 사유를 입력하십시오.
                  </p>
                </div>
                <input
                  type="text"
                  className="w-full text-xs px-2.5 py-2 border border-border bg-background/50 focus:border-destructive/80 focus:ring-1 focus:ring-destructive/30 focus:outline-hidden rounded-md placeholder:text-muted-foreground/60 transition-all"
                  placeholder="우회(Override) 사유를 필수 입력하세요..."
                  value={overrideReason}
                  onChange={(e) => {
                    setOverrideReason(e.target.value);
                    setIsDirty(true);
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className={cn(
                      "h-8 text-xs font-semibold transition-all hover:scale-[1.01]",
                      overrideReason.trim() ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_0_12px_rgba(239,68,68,0.25)]" : "bg-muted text-muted-foreground"
                    )}
                    disabled={!overrideReason.trim()}
                    onClick={() =>
                      handleAction("resolve_block", { overrideReason: overrideReason })
                    }
                  >
                    강제 우회 (Override)
                  </Button>
                  <Button
                    className="h-8 text-xs font-semibold hover:bg-muted/80 transition-all hover:scale-[1.01]"
                    variant="outline"
                    onClick={() => handleAction("resolve_block")} // payload 사유 생략 시 done(종료) 전이
                  >
                    강제 중단 (Kill)
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. ARCHIVE 레인 (완료/종료 항목) */}
        {item.lane === "archive" && (
          <div className="text-center py-1.5">
            <span className="text-[10px] text-muted-foreground/60 italic">
              처리 완료된 제어 액션입니다.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
