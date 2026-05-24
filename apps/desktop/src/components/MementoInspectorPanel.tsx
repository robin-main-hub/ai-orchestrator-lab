import { CheckCircle2, Database, Link2, Plus, Trash2 } from "lucide-react";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import type { WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

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
    "provider pending: limited recall preview": "프로바이더가 정해지기 전이라 제한된 기억만 미리 봄",
    "provider trust allows automatic recall trace": "신뢰된 프로바이더라 관련 기억을 자동으로 불러옴",
    "query overlap and trust policy passed": "현재 작업과 관련 있고 신뢰 정책을 통과함",
    "untrusted provider: project/user memory requires explicit selection": "신뢰되지 않은 프로바이더는 프로젝트/사용자 기억을 자동으로 받지 않음",
    "untrusted memory is quarantined until pinned": "신뢰되지 않은 기억은 고정 전까지 격리됨",
  };

  return labels[reason] ?? reason;
}

export function MementoInspectorPanel({
  inspector,
  onActivate,
  onForget,
  onPin,
  onRemember,
}: {
  inspector: Stage6MemoryInspector;
  onActivate: (recordId: string) => void;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
  onRemember: () => void;
}) {
  const visibleTrace = inspector.trace.results.slice(0, 6);
  const visibleRecords = inspector.records.slice(0, 8);
  const visibleRelations = inspector.relations.slice(0, 4);
  const visibleIssues = inspector.issues.slice(0, 4);
  const toolRows = [
    { id: "remember", label: "remember", value: "대화 저장" },
    { id: "recall", label: "recall", value: `${inspector.trace.results.length}개 후보` },
    { id: "context", label: "memory_context", value: `${inspector.contextPacket.activeRecordIds.length}개 활성` },
    { id: "reflect", label: "reflect", value: `${inspector.issues.length}개 이슈` },
    { id: "stats", label: "stats", value: mementoHealthLabel(inspector.stats.health) },
    { id: "relations", label: "relations", value: `${inspector.relations.length}개 링크` },
    { id: "activate", label: "activate", value: `${inspector.stats.activeRecords}개 활성` },
  ];
  const auditItems: WindowAuditItem[] = [
    {
      id: "context",
      label: "Memory Context",
      status: inspector.contextPacket.activeRecordIds.length > 0 ? "ready" : "partial",
      detail: "현재 대화에 실제로 주입할 기억 묶음과 보류된 기억을 분리합니다.",
    },
    {
      id: "relations",
      label: "Relation Graph",
      status: inspector.relations.length > 0 ? "ready" : "partial",
      detail: "관련 기억을 링크로 묶어 장기 프로젝트 맥락을 복원합니다.",
    },
    {
      id: "reflect",
      label: "Reflect",
      status: inspector.issues.length > 0 ? "partial" : "ready",
      detail: "중복, 모순, 오래된 기억, 비신뢰 활성 기억을 점검합니다.",
    },
    {
      id: "activation",
      label: "Activation",
      status: inspector.stats.activeRecords > 0 ? "ready" : "partial",
      detail: "필요한 기억만 명시적으로 활성화해서 컨텍스트 폭발을 줄입니다.",
    },
  ];

  return (
    <section className="side-panel memory-panel memento-panel">
      <header className="panel-title">
        <Database size={17} />
        <h2>Memento</h2>
        <button aria-label="현재 맥락 기억" className="icon-button" onClick={onRemember} type="button">
          <Plus size={15} />
        </button>
      </header>

      <div className="memory-policy">
        <strong>{inspector.trace.policy.autoRecallAllowed ? "자동 불러오기" : "수동 불러오기"}</strong>
        <span>{recallReasonLabel(inspector.trace.policy.reason)}</span>
      </div>

      <div className="memento-tool-grid" aria-label="Memento MCP tool coverage">
        {toolRows.map((tool) => (
          <div key={tool.id}>
            <span>{tool.label}</span>
            <strong>{tool.value}</strong>
          </div>
        ))}
      </div>

      <div className="memory-stat-grid memento-stats">
        <div>
          <span>기억</span>
          <strong>{inspector.stats.totalRecords}</strong>
        </div>
        <div>
          <span>활성</span>
          <strong>{inspector.stats.activeRecords}</strong>
        </div>
        <div>
          <span>관계</span>
          <strong>{inspector.stats.relationCount}</strong>
        </div>
        <div>
          <span>격리</span>
          <strong>{inspector.stats.quarantinedRecords}</strong>
        </div>
      </div>

      <div className={`memory-context-card ${inspector.stats.health}`}>
        <span>Memory Context</span>
        <strong>{inspector.contextPacket.summary}</strong>
        <p>
          active {inspector.contextPacket.activeRecordIds.length} / blocked{" "}
          {inspector.contextPacket.blockedRecordIds.length} / links {inspector.contextPacket.relationIds.length}
        </p>
      </div>

      <div className="memento-scroll">
        <section className="memento-section">
          <header>
            <span>Recall Trace</span>
            <strong>{visibleTrace.length}</strong>
          </header>
          <div className="recall-trace-list" aria-label="Recall Trace">
            {visibleTrace.map((result) => (
              <article className={result.usedInDecision ? "used" : "blocked"} key={result.record.id}>
                <div>
                  <strong>{result.record.title}</strong>
                  <span>
                    {mementoKindLabel(result.record.kind)} / {mementoScopeLabel(result.record.scope)} /{" "}
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </div>
                <em>{activationStateLabel(result.activationState)}</em>
                <p>{recallReasonLabel(result.reason)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="memento-section">
          <header>
            <span>Relations</span>
            <strong>{visibleRelations.length}</strong>
          </header>
          <div className="memory-relation-list">
            {visibleRelations.length === 0 ? (
              <article>
                <strong>링크 후보 없음</strong>
                <span>활성 기억이 늘어나면 관계 그래프를 만듭니다.</span>
              </article>
            ) : (
              visibleRelations.map((relation) => (
                <article key={relation.id}>
                  <strong>{memoryRelationLabel(relation.kind)}</strong>
                  <span>
                    {(relation.confidence * 100).toFixed(0)}% / {relation.fromRecordId.replace("memory_seed_", "")}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="memento-section">
          <header>
            <span>Reflect</span>
            <strong>{visibleIssues.length}</strong>
          </header>
          <div className="memory-reflection-list">
            {visibleIssues.length === 0 ? (
              <article className="good">
                <strong>정리 필요 없음</strong>
                <span>중복/모순/오래된 기억 경고가 없습니다.</span>
              </article>
            ) : (
              visibleIssues.map((issue) => (
                <article className={issue.severity} key={issue.id}>
                  <strong>{reflectionIssueLabel(issue.kind)}</strong>
                  <span>{issue.recommendation}</span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="memento-section">
          <header>
            <span>Memory Records</span>
            <strong>{visibleRecords.length}</strong>
          </header>
          <div className="memory-record-list" aria-label="Memory Records">
            {visibleRecords.map((record) => (
              <article key={record.id}>
                <div>
                  <strong>{record.title}</strong>
                  <span>
                    {mementoKindLabel(record.kind)} / {mementoScopeLabel(record.scope)} /{" "}
                    {trustLevelLabel(record.trustLevel)}
                  </span>
                </div>
                <button
                  aria-label={`${record.title} 활성화`}
                  className={`icon-button tiny ${record.activationState === "active" ? "active" : ""}`}
                  disabled={record.activationState === "active"}
                  onClick={() => onActivate(record.id)}
                  type="button"
                >
                  <Link2 size={13} />
                </button>
                <button
                  aria-label={`${record.title} 고정`}
                  className={`icon-button tiny ${record.pinned ? "active" : ""}`}
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
              </article>
            ))}
          </div>
        </section>
      </div>

      <WindowChecklist items={auditItems} title="Memento 창 점검" />
    </section>
  );
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

function activationStateLabel(state?: Stage6MemoryInspector["trace"]["results"][number]["activationState"]) {
  const labels: Record<NonNullable<Stage6MemoryInspector["trace"]["results"][number]["activationState"]>, string> = {
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

function mementoHealthLabel(health: Stage6MemoryInspector["stats"]["health"]) {
  const labels: Record<Stage6MemoryInspector["stats"]["health"], string> = {
    good: "정상",
    needs_review: "검토 필요",
    watch: "주의",
  };

  return labels[health];
}
