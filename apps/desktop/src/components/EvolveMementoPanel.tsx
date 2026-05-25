import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  Link2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import { cn } from "../lib/utils";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";

/**
 * EvolveMemento panel — unified naming of the Memento + EvolveMem
 * (arXiv:2605.13941) merger. Replaces the legacy MementoInspectorPanel.
 *
 * "EvolveMemento" = our Memento (long-term memory store + UI) extended
 * with EvolveMem-style multi-view retrieval and (eventually) the
 * self-evolving retrieval loop. The runtime layer (`Stage6MemoryInspector`
 * et al.) keeps the historical `Memory*` naming to avoid runtime churn;
 * this UI surface adopts the unified product name.
 *
 * Applies docs/design-decisions.md §10 (Notion-style document canvas)
 * and §1 (no WindowChecklist in production UI).
 *
 * Layout strategy: **always-visible summary + collapsible drawers for
 * detail.** The legacy panel rendered every section flat (Recall Trace
 * + Relations + Reflect + Records all simultaneously), producing the
 * "dashboard of dashboards" feel design-decisions explicitly rejects.
 *
 * Default view is now:
 *   [auto-load indicator] · [4 stat chips] · [context summary card]
 *   [Recall Trace drawer — open]
 *   [Relations drawer — closed]
 *   [Reflect drawer — auto-open if issues > 0]
 *   [Records drawer — closed]
 *
 * Every action the old panel exposed (activate / pin / forget) is
 * preserved inside the Records drawer; no functional regression.
 *
 * WindowChecklist intentionally removed per design-decisions §1.
 */

export type EvolveMementoPanelProps = {
  inspector: Stage6MemoryInspector;
  onActivate: (recordId: string) => void;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
  onRemember: () => void;
};

/** Back-compat alias for callers that still import the old name. */
export type MementoPanelProps = EvolveMementoPanelProps;

export function EvolveMementoPanel({
  inspector,
  onActivate,
  onForget,
  onPin,
  onRemember,
}: EvolveMementoPanelProps) {
  const visibleTrace = inspector.trace.results.slice(0, 6);
  const visibleRecords = inspector.records.slice(0, 8);
  const visibleRelations = inspector.relations.slice(0, 4);
  const visibleIssues = inspector.issues.slice(0, 4);
  const policy = inspector.trace.policy;

  return (
    <section className="side-panel memory-panel memento-panel-v2" aria-label="EvolveMemento">
      <header className="panel-title">
        <Database size={17} />
        <h2>EvolveMemento</h2>
        <span className="memento-v2__count">{inspector.stats.totalRecords}</span>
        <button
          aria-label="현재 맥락 기억"
          className="icon-button"
          onClick={onRemember}
          type="button"
        >
          <Plus size={15} />
        </button>
      </header>

      <div
        className={cn(
          "memento-v2__policy",
          policy.autoRecallAllowed
            ? "memento-v2__policy--auto"
            : "memento-v2__policy--manual",
        )}
      >
        <Sparkles size={12} />
        <strong>{policy.autoRecallAllowed ? "자동 불러오기" : "수동 불러오기"}</strong>
        <span>{recallReasonLabel(policy.reason)}</span>
      </div>

      <div className="memento-v2__stats">
        <Stat label="기억" value={inspector.stats.totalRecords} />
        <Stat label="활성" value={inspector.stats.activeRecords} tone="cyan" />
        <Stat label="관계" value={inspector.stats.relationCount} />
        <Stat
          label="격리"
          value={inspector.stats.quarantinedRecords}
          tone={inspector.stats.quarantinedRecords > 0 ? "amber" : undefined}
        />
      </div>

      <div className={cn("memento-v2__context", `memento-v2__context--${inspector.stats.health}`)}>
        <span className="memento-v2__context-label">Memory Context</span>
        <strong className="memento-v2__context-summary">
          {inspector.contextPacket.summary}
        </strong>
        <p className="memento-v2__context-meta">
          active {inspector.contextPacket.activeRecordIds.length} · blocked{" "}
          {inspector.contextPacket.blockedRecordIds.length} · links{" "}
          {inspector.contextPacket.relationIds.length}
        </p>
      </div>

      <div className="memento-v2__drawers">
        <Drawer
          label="Recall Trace"
          count={visibleTrace.length}
          defaultOpen
          empty={
            visibleTrace.length === 0
              ? "현재 작업에 매칭되는 recall 후보가 없습니다."
              : undefined
          }
        >
          {visibleTrace.map((result) => (
            <article
              className={cn(
                "memento-v2__trace",
                result.usedInDecision ? "memento-v2__trace--used" : "memento-v2__trace--blocked",
              )}
              key={result.record.id}
            >
              <div className="memento-v2__trace-head">
                <strong className="memento-v2__trace-title">
                  {result.record.title}
                </strong>
                <span className="memento-v2__trace-score">
                  {(result.score * 100).toFixed(0)}%
                </span>
              </div>
              <span className="memento-v2__trace-meta">
                {mementoKindLabel(result.record.kind)} · {mementoScopeLabel(result.record.scope)} ·{" "}
                {activationStateLabel(result.activationState)}
              </span>
              <p className="memento-v2__trace-reason">{recallReasonLabel(result.reason)}</p>
            </article>
          ))}
        </Drawer>

        <Drawer
          label="Relations"
          count={visibleRelations.length}
          empty={
            visibleRelations.length === 0
              ? "활성 기억이 늘어나면 관계 그래프가 생깁니다."
              : undefined
          }
        >
          {visibleRelations.map((relation) => (
            <article className="memento-v2__relation" key={relation.id}>
              <strong>{memoryRelationLabel(relation.kind)}</strong>
              <span>
                {(relation.confidence * 100).toFixed(0)}% ·{" "}
                {relation.fromRecordId.replace("memory_seed_", "")}
              </span>
            </article>
          ))}
        </Drawer>

        <Drawer
          label="Reflect"
          count={visibleIssues.length}
          defaultOpen={visibleIssues.length > 0}
          empty={
            visibleIssues.length === 0
              ? "정리가 필요한 중복 / 모순 / 오래된 기억 없음."
              : undefined
          }
        >
          {visibleIssues.map((issue) => (
            <article
              className={cn("memento-v2__issue", `memento-v2__issue--${issue.severity}`)}
              key={issue.id}
            >
              <strong>{reflectionIssueLabel(issue.kind)}</strong>
              <span>{issue.recommendation}</span>
            </article>
          ))}
        </Drawer>

        <Drawer label="Records" count={visibleRecords.length}>
          {visibleRecords.map((record) => (
            <article className="memento-v2__record" key={record.id}>
              <div className="memento-v2__record-body">
                <strong className="memento-v2__record-title">{record.title}</strong>
                <span className="memento-v2__record-meta">
                  {mementoKindLabel(record.kind)} · {mementoScopeLabel(record.scope)} ·{" "}
                  {trustLevelLabel(record.trustLevel)}
                </span>
              </div>
              <div className="memento-v2__record-actions">
                <button
                  aria-label={`${record.title} 활성화`}
                  className={cn(
                    "icon-button tiny",
                    record.activationState === "active" && "active",
                  )}
                  disabled={record.activationState === "active"}
                  onClick={() => onActivate(record.id)}
                  type="button"
                >
                  <Link2 size={13} />
                </button>
                <button
                  aria-label={`${record.title} 고정`}
                  className={cn("icon-button tiny", record.pinned && "active")}
                  disabled={record.pinned}
                  onClick={() => onPin(record.id)}
                  type="button"
                >
                  <CheckCircle2 size={13} />
                </button>
                <button
                  aria-label={`${record.title} 삭제`}
                  className="icon-button tiny"
                  onClick={() => onForget(record.id)}
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          ))}
        </Drawer>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "cyan" | "amber";
}) {
  return (
    <div className={cn("memento-v2__stat", tone && `memento-v2__stat--${tone}`)}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Drawer({
  label,
  count,
  defaultOpen = false,
  empty,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  empty?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="memento-v2__drawer">
      <button
        aria-expanded={open}
        className="memento-v2__drawer-trigger"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <ChevronDown
          className={cn(
            "memento-v2__drawer-chevron",
            !open && "memento-v2__drawer-chevron--closed",
          )}
          size={12}
        />
        <span className="memento-v2__drawer-label">{label}</span>
        <span className="memento-v2__drawer-count">{count}</span>
      </button>
      {open && (
        <div className="memento-v2__drawer-content">
          {empty ? <p className="memento-v2__empty">{empty}</p> : children}
        </div>
      )}
    </div>
  );
}

// ── Label helpers — unchanged from legacy, kept local to this file ──

function trustLevelLabel(trustLevel: MemoryRecord["trustLevel"]) {
  const labels: Record<MemoryRecord["trustLevel"], string> = {
    limited: "제한됨",
    trusted: "신뢰됨",
    untrusted: "격리됨",
  };
  return labels[trustLevel];
}

function recallReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    "blocked by provider trust policy": "프로바이더 신뢰 정책으로 보류됨",
    "low query overlap": "현재 작업과 관련도가 낮음",
    "provider pending: limited recall preview":
      "프로바이더가 정해지기 전이라 제한된 기억만 미리 봄",
    "provider trust allows automatic recall trace":
      "신뢰된 프로바이더라 관련 기억을 자동으로 불러옴",
    "query overlap and trust policy passed": "현재 작업과 관련 있고 신뢰 정책을 통과함",
    "untrusted provider: project/user memory requires explicit selection":
      "신뢰되지 않은 프로바이더는 프로젝트/사용자 기억을 자동으로 받지 않음",
    "untrusted memory is quarantined until pinned": "신뢰되지 않은 기억은 고정 전까지 격리됨",
  };
  return labels[reason] ?? reason;
}

function mementoScopeLabel(scope?: MemoryRecord["scope"]) {
  const labels: Record<NonNullable<MemoryRecord["scope"]>, string> = {
    global: "전역",
    project: "프로젝트",
    session: "세션",
  };
  return scope ? labels[scope] : "자동";
}

function mementoKindLabel(kind?: MemoryRecord["kind"]) {
  const labels: Record<NonNullable<MemoryRecord["kind"]>, string> = {
    architecture: "아키텍처",
    context: "맥락",
    decision: "결정",
    learning: "학습",
    pattern: "패턴",
    preference: "선호",
    relationship: "관계",
    workflow: "작업흐름",
  };
  return kind ? labels[kind] : "미분류";
}

function activationStateLabel(
  state?: Stage6MemoryInspector["trace"]["results"][number]["activationState"],
) {
  const labels: Record<
    NonNullable<Stage6MemoryInspector["trace"]["results"][number]["activationState"]>,
    string
  > = {
    active: "사용됨",
    inactive: "대기",
    quarantined: "격리",
    suggested: "후보",
  };
  return state ? labels[state] : "대기";
}

function memoryRelationLabel(kind: Stage6MemoryInspector["relations"][number]["kind"]) {
  const labels: Record<Stage6MemoryInspector["relations"][number]["kind"], string> = {
    contradicts: "모순",
    depends_on: "의존",
    related: "관련",
    supersedes: "대체",
    supports: "보강",
  };
  return labels[kind];
}

function reflectionIssueLabel(kind: Stage6MemoryInspector["issues"][number]["kind"]) {
  const labels: Record<Stage6MemoryInspector["issues"][number]["kind"], string> = {
    contradiction: "모순 후보",
    duplicate: "중복 후보",
    missing_relation: "관계 부족",
    stale: "오래된 기억",
    untrusted_active: "비신뢰 활성",
  };
  return labels[kind];
}
