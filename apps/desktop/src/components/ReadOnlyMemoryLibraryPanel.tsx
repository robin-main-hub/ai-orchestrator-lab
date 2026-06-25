import { Boxes, Layers, Pin } from "lucide-react";
import type { MemoryRecord, SourceTrust } from "@ai-orchestrator/protocol";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import type { MemoryGovernanceSummary } from "../lib/memoryGovernance";

/**
 * Read-only memory library catalog (the `library.memory` shell surface).
 *
 * Presentational only. It renders memory read models already held in App state —
 * the governance summary, the Stage6 inspector distributions, and the memory
 * records — passed via props. It never fetches, never writes / syncs / evaluates
 * memory, never approves curator candidates, and shows no record body content
 * (only catalog metadata). Honest empty state when there are no records.
 */
const TRUST_LABEL: Record<SourceTrust, string> = {
  trusted: "신뢰",
  limited: "제한",
  untrusted: "비신뢰",
};

const TRUST_VARIANT: Record<SourceTrust, StatusBadgeVariant> = {
  trusted: "success",
  limited: "warning",
  untrusted: "danger",
};

function statusVariant(status: MemoryGovernanceSummary["status"]): StatusBadgeVariant {
  if (status === "ready") return "success";
  if (status === "attention") return "warning";
  return "danger";
}

function healthVariant(health: Stage6MemoryInspector["stats"]["health"]): StatusBadgeVariant {
  if (health === "good") return "success";
  if (health === "watch") return "warning";
  return "danger";
}

function adapterVariant(status: "loading" | "ready" | "error"): StatusBadgeVariant {
  if (status === "ready") return "success";
  if (status === "loading") return "warning";
  return "danger";
}

function activationVariant(state: MemoryRecord["activationState"]): StatusBadgeVariant {
  if (state === "active") return "success";
  if (state === "quarantined") return "danger";
  return "muted";
}

const RECORD_CAP = 40;

export function ReadOnlyMemoryLibraryPanel({
  adapterStatus,
  governanceSummary,
  inspector,
  records,
}: {
  adapterStatus: "loading" | "ready" | "error";
  governanceSummary: MemoryGovernanceSummary;
  inspector: Stage6MemoryInspector;
  records: MemoryRecord[];
}) {
  const stats = inspector.stats;
  const sorted = [...records].sort((a, b) =>
    (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""),
  );
  const latestUpdated = sorted[0]?.updatedAt ?? sorted[0]?.createdAt;
  const shown = sorted.slice(0, RECORD_CAP);

  return (
    <div className="flex flex-col gap-3" aria-label="메모리 라이브러리">
      {/* governance summary — read-only counts + health + scope */}
      <div className="rounded-lg border border-border bg-card/40 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge variant={statusVariant(governanceSummary.status)}>{governanceSummary.healthLabel}</StatusBadge>
          <StatusBadge variant={healthVariant(stats.health)}>무결성 {stats.health}</StatusBadge>
          <StatusBadge variant={adapterVariant(adapterStatus)}>어댑터 {adapterStatus}</StatusBadge>
          <span className="text-[11px] text-muted-foreground">{governanceSummary.currentScopeLabel}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>전체 {governanceSummary.totalRecords}개</span>
          <span>활성 {governanceSummary.activeCount}개</span>
          <span>고정 {governanceSummary.pinnedCount}개</span>
          <span>격리 {governanceSummary.quarantinedCount}개</span>
          <span>폐기 {governanceSummary.tombstonedCount}개</span>
        </div>
      </div>

      {/* integrity signals + write/conflict projection (read-only) */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-[11px] text-muted-foreground">
        <span>관계 {stats.relationCount}</span>
        <span>중복 후보 {stats.duplicateCandidates}</span>
        <span>모순 후보 {stats.contradictionCandidates}</span>
        <span>비활성 후보 {stats.staleCandidates}</span>
        <span>대기 쓰기 {inspector.eventProjection.pendingWrites}</span>
        <span>충돌 {inspector.eventProjection.conflictCount}</span>
        <span>차단 {inspector.blockedCount}</span>
      </div>

      {/* distributions: trust / scope / layer / kind */}
      <div className="flex flex-col gap-1.5 px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">신뢰</span>
          {(Object.keys(inspector.trustCounts) as SourceTrust[]).map((trust) => (
            <StatusBadge key={trust} variant={TRUST_VARIANT[trust]}>
              {TRUST_LABEL[trust]} {inspector.trustCounts[trust]}
            </StatusBadge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">범위</span>
          {inspector.scopeCounts.map((entry) => (
            <StatusBadge key={entry.scope} variant="muted">
              {entry.scope} {entry.count}
            </StatusBadge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">계층</span>
          {inspector.layerCounts.map((entry) => (
            <StatusBadge key={entry.layer} variant="muted">
              {entry.layer} {entry.count}
            </StatusBadge>
          ))}
        </div>
        {inspector.kindCounts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">종류</span>
            {inspector.kindCounts.map((entry) => (
              <StatusBadge key={entry.kind} variant="muted">
                {entry.kind} {entry.count}
              </StatusBadge>
            ))}
          </div>
        ) : null}
      </div>

      {/* record catalog — metadata only, no body content, no mutation controls */}
      {records.length === 0 ? (
        <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" />
          메모리 기록이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>기록 {shown.length === records.length ? `${records.length}개` : `최근 ${shown.length}개 · 전체 ${records.length}개`}</span>
            {latestUpdated ? <span>최근 갱신 {latestUpdated}</span> : null}
          </div>
          <ul className="flex flex-col gap-1">
            {shown.map((record) => (
              <li className="rounded-md border border-border/60 bg-card/30 px-2 py-1.5" key={record.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground">{record.title}</span>
                  {record.pinned ? <Pin className="h-3 w-3 text-primary" /> : null}
                  <StatusBadge variant={TRUST_VARIANT[record.trustLevel]}>{TRUST_LABEL[record.trustLevel]}</StatusBadge>
                  {record.activationState ? (
                    <StatusBadge variant={activationVariant(record.activationState)}>{record.activationState}</StatusBadge>
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                  <span>{record.layer}</span>
                  {record.scope ? <span>· {record.scope}</span> : null}
                  {record.kind ? <span>· {record.kind}</span> : null}
                  <span>· {record.sourceChannel}</span>
                  {record.updatedAt ?? record.createdAt ? <span>· {record.updatedAt ?? record.createdAt}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
