import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  CheckCircle2,
  XCircle,
  Clock,
  GitPullRequestArrow,
  FileDiff,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  APPROVAL_STATE_LABEL,
  isApprovableState,
  type RunnerPatchApprovalItem,
} from "../lib/runnerPatchApprovalQueue";
import {
  SAFETY_BLOCKER_REASON,
  SAFETY_WARNING_REASON,
} from "../lib/runnerPatchSafety";

/**
 * H8e — Runner Patch Approval Panel.
 *
 * `useRunnerPatchApprovalQueueController`에서 만든 항목들을 결재함처럼 보여준다.
 * UI 규칙:
 *  - safety blocked 항목은 "Approve" 버튼을 비활성화한다 (자동 적용 0).
 *  - safety warning은 approvable이지만 warning badge를 같이 보여준다.
 *  - verification은 runner-claimed vs actual을 둘 다 보여준다.
 *  - "Approve for Apply Step" 버튼은 큐 상태만 바꾼다 — apply 호출 0.
 *  - "Reject"는 사유 입력 후 거절.
 *  - 거절/승인된 항목은 더 이상 결재 액션을 노출하지 않는다.
 */

export function RunnerPatchApprovalPanel({
  items,
  onApprove,
  onReject,
  emptyHint = "결재 대기 중인 patch handoff가 없습니다.",
}: {
  items: ReadonlyArray<RunnerPatchApprovalItem>;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, reason: string) => void;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return (
      <Card data-testid="runner-patch-approval-panel" data-count={0}>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm font-medium">
            <GitPullRequestArrow className="h-4 w-4 text-cyan-300/80" />
            Runner Patch 결재함
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground" data-testid="runner-patch-approval-empty">
            {emptyHint}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="runner-patch-approval-panel" data-count={items.length}>
      <CardHeader>
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitPullRequestArrow className="h-4 w-4 text-cyan-300/80" />
          Runner Patch 결재함
          <Badge variant="outline" data-testid="runner-patch-approval-total">
            {items.length}건
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2" data-testid="runner-patch-approval-list">
          {items.map((item) => (
            <li key={item.id}>
              <ApprovalRow item={item} onApprove={onApprove} onReject={onReject} />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ApprovalRow({
  item,
  onApprove,
  onReject,
}: {
  item: RunnerPatchApprovalItem;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, reason: string) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { handoff } = item;
  const safety = handoff.safety;
  const resolved = item.state === "approved_for_apply" || item.state === "rejected";
  const canApprove = !resolved && isApprovableState(item.state);
  const canReject = !resolved;

  const safetyBadge = (
    <Badge
      variant={
        safety.status === "blocked" ? "destructive" : safety.status === "warning" ? "outline" : "default"
      }
      data-testid={`runner-patch-approval-safety-${item.id}`}
      data-safety={safety.status}
    >
      {safety.status === "blocked" ? (
        <ShieldX className="mr-1 inline h-3 w-3" />
      ) : safety.status === "warning" ? (
        <ShieldAlert className="mr-1 inline h-3 w-3" />
      ) : (
        <ShieldCheck className="mr-1 inline h-3 w-3" />
      )}
      Safety: {safety.status.toUpperCase()}
    </Badge>
  );

  const stateBadge = (
    <Badge
      variant={
        item.state === "approved_for_apply"
          ? "default"
          : item.state === "rejected"
            ? "destructive"
            : item.state === "blocked"
              ? "destructive"
              : "outline"
      }
      data-testid={`runner-patch-approval-state-${item.id}`}
      data-state={item.state}
    >
      {item.state === "approved_for_apply" ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : null}
      {item.state === "rejected" ? <XCircle className="mr-1 inline h-3 w-3" /> : null}
      {item.state === "pending" ? <Clock className="mr-1 inline h-3 w-3" /> : null}
      {APPROVAL_STATE_LABEL[item.state]}
    </Badge>
  );

  return (
    <div
      className="rounded-md border border-white/10 bg-white/[0.02] p-3"
      data-testid={`runner-patch-approval-item-${item.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {stateBadge}
        {safetyBadge}
        <Badge variant="outline" data-testid={`runner-patch-approval-runner-${item.id}`}>
          runner: {handoff.runnerId}
        </Badge>
        <Badge variant="outline" data-testid={`runner-patch-approval-mission-${item.id}`}>
          mission: {handoff.missionId}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1" data-testid={`runner-patch-approval-stats-${item.id}`}>
          <FileDiff className="h-3 w-3" /> {handoff.stats.files}개 파일 · +{handoff.stats.additions} / -
          {handoff.stats.deletions}
        </span>
      </div>

      {/* runner-claimed vs actual verification — H8d split */}
      <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
        <div data-testid={`runner-patch-approval-claimed-${item.id}`}>
          <span className="text-muted-foreground">Runner-claimed tests:</span>{" "}
          {handoff.testResult.ran
            ? `${handoff.testResult.passed} passed${handoff.testResult.failed > 0 ? ` · ${handoff.testResult.failed} failed` : ""}`
            : "not run"}
        </div>
        <div data-testid={`runner-patch-approval-actual-${item.id}`}>
          <span className="text-muted-foreground">Actual verification:</span>{" "}
          {safety.verification.actualVerification.status === "not_run"
            ? "not run"
            : safety.verification.actualVerification.status}
          {safety.verification.mismatch ? (
            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-300">
              <AlertTriangle className="h-3 w-3" /> mismatch
            </span>
          ) : null}
        </div>
      </div>

      {/* safety breakdown */}
      {handoff.safetyBlockers.length > 0 ? (
        <ul
          className="mt-2 space-y-0.5 text-[11px] text-rose-300"
          data-testid={`runner-patch-approval-blockers-${item.id}`}
        >
          {handoff.safetyBlockers.map((b) => (
            <li key={b}>· {SAFETY_BLOCKER_REASON[b]}</li>
          ))}
        </ul>
      ) : null}
      {handoff.safetyWarnings.length > 0 ? (
        <ul
          className="mt-1 space-y-0.5 text-[11px] text-amber-300/90"
          data-testid={`runner-patch-approval-warnings-${item.id}`}
        >
          {handoff.safetyWarnings.map((w) => (
            <li key={w}>· {SAFETY_WARNING_REASON[w]}</li>
          ))}
        </ul>
      ) : null}

      {/* rejection reason (already resolved) */}
      {item.state === "rejected" && item.rejectionReason ? (
        <p
          className="mt-2 text-[11px] text-rose-300/80"
          data-testid={`runner-patch-approval-rejection-reason-${item.id}`}
        >
          거절 사유: {item.rejectionReason}
        </p>
      ) : null}

      <CardFooter className="flex flex-wrap gap-2 px-0 pt-3">
        <Button
          variant="default"
          size="sm"
          disabled={!canApprove}
          data-testid={`runner-patch-approval-approve-${item.id}`}
          onClick={() => onApprove(item.id)}
          title={
            canApprove
              ? "이 patch handoff를 다음 적용 단계 후보로 표시합니다. apply는 별도 단계에서."
              : item.state === "blocked"
                ? "safety blocked — 승인 불가"
                : "이미 결재됨"
          }
        >
          <CheckCircle2 className="mr-1 h-3 w-3" /> Approve for Apply Step
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canReject}
          data-testid={`runner-patch-approval-reject-${item.id}`}
          onClick={() => setRejectOpen((v) => !v)}
        >
          <XCircle className="mr-1 h-3 w-3" /> Reject
        </Button>
      </CardFooter>

      {rejectOpen && canReject ? (
        <div
          className="mt-1 flex items-center gap-2"
          data-testid={`runner-patch-approval-reject-form-${item.id}`}
        >
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="거절 사유 (선택)"
            className="flex-1 rounded border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px]"
            data-testid={`runner-patch-approval-reject-reason-${item.id}`}
          />
          <Button
            variant="outline"
            size="sm"
            data-testid={`runner-patch-approval-reject-confirm-${item.id}`}
            onClick={() => {
              onReject(item.id, reason);
              setReason("");
              setRejectOpen(false);
            }}
          >
            거절 확정
          </Button>
        </div>
      ) : null}
    </div>
  );
}
