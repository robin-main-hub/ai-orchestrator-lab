import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Hash,
  Plus,
  Sparkles,
  TrendingUp,
  UserRound,
  MoreVertical,
  Sliders,
  AlertTriangle,
  Trash2,
  Pin,
  Check,
  Search,
} from "lucide-react";
import type { MemoryRecord, RecallResult } from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/ui/tabs";
import { ScrollArea } from "@/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

/**
 * EvolveMemento panel — strict v0 port.
 *
 * source: docs/v0/v0-output/components/sidebar/memento-panel.tsx
 *
 * v0 structure (intentional — what user gets):
 *   - header (chevron + title + count + add)
 *   - auto-load indicator (Sparkles + policy line)
 *   - 4 mini stat cells
 *   - Memory Context card
 *   - Recall Trace drawer (only)
 *
 * Stage 1b v2 의 신규 schema 시각화 (importance bar / chip strip /
 * fusion breakdown) 는 Recall Trace row 안에 carry — v0 의 행 구조를
 * 그대로 두면서 새 메타데이터를 추가 라인으로 노출.
 *
 * Records management actions (activate / pin / forget) 는 v0 가
 * 디자인하지 않은 영역. 호스트 (App.tsx) 는 콜백을 그대로 전달하지만
 * 이 panel 은 v0 그대로의 read-only 뷰. Records 관리는 향후 별도
 * 진입점 (right-click context menu, 또는 Records sub-page) 으로 옮길
 * 예정. 그 전까지는 콜백 reference 만 유지해서 host 의 contract 가
 * 깨지지 않음.
 */

export type EvolveMementoPanelProps = {
  adapterStatus: "loading" | "ready" | "error";
  inspector: Stage6MemoryInspector;
  onActivate: (recordId: string) => void;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
  onRemember: () => void;
};

/** Back-compat alias. */
export type MementoPanelProps = EvolveMementoPanelProps;

export function EvolveMementoPanel({
  adapterStatus,
  inspector,
  onRemember,
  onActivate,
  onForget,
  onPin,
}: EvolveMementoPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"records" | "relations" | "reflect">("records");

  const visibleTrace = inspector.trace.results.slice(0, 6);
  const policy = inspector.trace.policy;
  const ctx = inspector.contextPacket;

  return (
    <section
      aria-label="EvolveMemento"
      className="evolvememento-root rounded-lg border border-border bg-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <button
          aria-expanded={isOpen}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
          onClick={() => setIsOpen((o) => !o)}
          type="button"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !isOpen && "-rotate-90",
            )}
          />
          <Database className="h-4 w-4" />
          EvolveMemento
          <span className="text-xs text-muted-foreground">
            {inspector.stats.totalRecords}
          </span>
          <StatusBadge
            size="sm"
            variant={
              adapterStatus === "ready"
                ? "success"
                : adapterStatus === "error"
                  ? "danger"
                  : "muted"
            }
          >
            {adapterStatus === "loading" ? "..." : adapterStatus === "error" ? "err" : "dgx"}
          </StatusBadge>
        </button>
        <div className="flex items-center gap-1">
          <Button
            aria-label="기록 관리"
            className="h-6 w-6"
            onClick={() => {
              setActiveTab("records");
              setIsManagerOpen(true);
            }}
            size="icon"
            variant="ghost"
          >
            <Sliders className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label="현재 맥락 기억"
            className="h-6 w-6"
            onClick={onRemember}
            size="icon"
            variant="ghost"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isOpen ? (
        <div className="space-y-4 p-3">
          {/* Auto-load indicator */}
          <div className="flex items-start gap-2">
            <Sparkles
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                policy.autoRecallAllowed ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0">
              <div className="text-xs text-foreground">
                {policy.autoRecallAllowed ? "자동 불러오기" : "수동 불러오기"}
              </div>
              <div className="text-[10px] text-muted-foreground line-clamp-2">
                {recallReasonLabel(policy.reason)}
              </div>
            </div>
          </div>

          {/* 4 mini stats */}
          <div className="grid grid-cols-4 gap-1.5">
            <MiniStat
              label="기억"
              value={inspector.stats.totalRecords}
              onClick={() => {
                setActiveTab("records");
                setIsManagerOpen(true);
              }}
            />
            <MiniStat
              label="활성"
              value={inspector.stats.activeRecords}
              tone="cyan"
              onClick={() => {
                setActiveTab("records");
                setIsManagerOpen(true);
              }}
            />
            <MiniStat
              label="관계"
              value={inspector.stats.relationCount}
              onClick={() => {
                setActiveTab("relations");
                setIsManagerOpen(true);
              }}
            />
            <MiniStat
              label="격리"
              tone={inspector.stats.quarantinedRecords > 0 ? "amber" : "neutral"}
              value={inspector.stats.quarantinedRecords}
              onClick={() => {
                setActiveTab("reflect");
                setIsManagerOpen(true);
              }}
            />
          </div>

          {/* Memory Context */}
          <div className="rounded-md border border-border bg-card/40 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Memory Context
            </div>
            <div className="mt-1 text-xs text-foreground line-clamp-2">
              {ctx.summary}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              active {ctx.activeRecordIds.length} · blocked{" "}
              {ctx.blockedRecordIds.length} · links {ctx.relationIds.length}
            </div>
          </div>

          {/* Recall Trace — sole drawer */}
          <RecallTraceList
            traces={visibleTrace}
            onActivate={onActivate}
            onForget={onForget}
            onPin={onPin}
          />
        </div>
      ) : null}

      <EvolveMementoManagerDialog
        activeTab={activeTab}
        inspector={inspector}
        isOpen={isManagerOpen}
        onActivate={onActivate}
        onForget={onForget}
        onPin={onPin}
        onTabChange={setActiveTab}
        onClose={() => setIsManagerOpen(false)}
      />
    </section>
  );
}

// ── v0-style sub-components ──────────────────────────────────────────

function MiniStat({
  label,
  value,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "cyan" | "amber";
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "text-sm font-semibold",
          tone === "cyan" && "text-primary",
          tone === "amber" && "text-warning",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        type="button"
        className="flex flex-col items-center rounded-md bg-card/40 py-1.5 hover:bg-card/85 transition-colors w-full cursor-pointer"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center rounded-md bg-card/40 py-1.5">
      {content}
    </div>
  );
}

function RecallTraceList({
  traces,
  onActivate,
  onForget,
  onPin,
}: {
  traces: RecallResult[];
  onActivate: (recordId: string) => void;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-card/60"
        onClick={() => setExpanded((o) => !o)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Recall Trace</span>
          <span className="text-muted-foreground">{traces.length}</span>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {expanded ? (
        <div className="mt-1 space-y-1">
          {traces.length === 0 ? (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              현재 작업에 매칭되는 recall 후보가 없습니다.
            </p>
          ) : (
            traces.map((trace) => (
              <RecallTraceRow
                key={trace.record.id}
                result={trace}
                onActivate={onActivate}
                onForget={onForget}
                onPin={onPin}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function RecallTraceRow({
  result,
  onActivate,
  onForget,
  onPin,
}: {
  result: RecallResult;
  onActivate: (recordId: string) => void;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card/40 p-2 transition-colors",
        result.usedInDecision
          ? "border-primary/40"
          : "border-border opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-xs font-medium text-foreground"
              title={result.record.losslessRestatement ?? result.record.content}
            >
              {result.record.title}
            </span>
            {result.usedInDecision ? (
              <StatusBadge variant="primary" size="sm">
                사용됨
              </StatusBadge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {mementoKindLabel(result.record.kind)} ·{" "}
            {mementoScopeLabel(result.record.scope)}
          </p>
        </div>

        {/* Actions Dropdown */}
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[10px] text-muted-foreground">
            {(result.score * 100).toFixed(0)}%
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="기록 관리 메뉴"
                className="h-5 w-5 hover:bg-card"
                size="icon"
                variant="ghost"
              >
                <MoreVertical className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onSelect={() => onPin(result.record.id)}>
                기억 고정 (Pin)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onActivate(result.record.id)}>
                기억 활성화
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onForget(result.record.id)}
                variant="destructive"
              >
                기억 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ImportanceBar
        importance={result.record.importance}
        reinforcement={result.record.entityReinforcement}
      />
      <RecordChips record={result.record} />
      <FusionBreakdown detail={result.fusionDetail} />
    </div>
  );
}

function ImportanceBar({
  importance,
  reinforcement,
}: {
  importance?: number;
  reinforcement?: number;
}) {
  if (importance === undefined && !reinforcement) return null;
  const pct = Math.max(0, Math.min(1, importance ?? 0)) * 100;
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5"
      title={`importance ${pct.toFixed(0)}% · reinforce +${(reinforcement ?? 0).toFixed(1)}`}
    >
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-card/70">
        <div
          className="h-full bg-gradient-to-r from-primary/50 to-primary transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      {reinforcement && reinforcement > 0 ? (
        <StatusBadge variant="success" size="sm" className="font-mono gap-0.5 shrink-0">
          <TrendingUp className="h-2.5 w-2.5" />
          {reinforcement.toFixed(1)}
        </StatusBadge>
      ) : null}
    </div>
  );
}

function RecordChips({ record }: { record: MemoryRecord }) {
  const topic = record.topic;
  const persons = record.persons ?? [];
  const entities = record.entities ?? [];
  const keywords = record.keywords ?? [];
  const hasAny =
    topic || persons.length > 0 || entities.length > 0 || keywords.length > 0;
  if (!hasAny) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {topic ? (
        <Chip tone="primary" title={`topic: ${topic}`}>
          <Hash className="h-2.5 w-2.5" />
          {topic}
        </Chip>
      ) : null}
      {persons.slice(0, 3).map((p) => (
        <Chip key={`p-${p}`} title={`person: ${p}`} tone="violet">
          <UserRound className="h-2.5 w-2.5" />
          {p}
        </Chip>
      ))}
      {persons.length > 3 ? <ChipOverflow count={persons.length - 3} /> : null}
      {entities.slice(0, 3).map((e) => (
        <Chip key={`e-${e}`} title={`entity: ${e}`} tone="warning">
          {e}
        </Chip>
      ))}
      {entities.length > 3 ? <ChipOverflow count={entities.length - 3} /> : null}
      {keywords.slice(0, 5).map((k) => (
        <Chip key={`k-${k}`} title={`keyword: ${k}`}>
          {k}
        </Chip>
      ))}
      {keywords.length > 5 ? <ChipOverflow count={keywords.length - 5} /> : null}
    </div>
  );
}

function Chip({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone?: "primary" | "violet" | "warning";
  title?: string;
}) {
  const variant =
    tone === "primary" ? "primary"
    : tone === "warning" ? "warning"
    : "muted";

  return (
    <span title={title}>
      <StatusBadge variant={variant} size="sm" className="font-mono gap-0.5">
        {children}
      </StatusBadge>
    </span>
  );
}

function ChipOverflow({ count }: { count: number }) {
  return (
    <span className="px-1 text-[9px] font-mono text-muted-foreground">
      +{count}
    </span>
  );
}

function FusionBreakdown({ detail }: { detail?: RecallResult["fusionDetail"] }) {
  if (!detail || detail.views.length === 0) return null;
  const viewShort: Record<"lexical" | "semantic" | "metadata", string> = {
    lexical: "lex",
    semantic: "sem",
    metadata: "meta",
  };
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1 rounded bg-card/70 px-1 py-0.5 font-mono"
      title={`fusion mode: ${detail.fusionMode} (RRF k=60)`}
    >
      <span className="text-[8.5px] uppercase tracking-wider text-muted-foreground">
        {detail.fusionMode}
      </span>
      {detail.views.map((v) => {
        const variant =
          v.view === "lexical" ? "warning"
          : v.view === "metadata" ? "success"
          : "muted";
        return (
          <span
            key={`${v.view}-${v.rank}`}
            title={`${v.view} rank #${v.rank} (raw ${v.rawScore.toFixed(2)})`}
          >
            <StatusBadge variant={variant} size="sm" className="font-mono">
              {viewShort[v.view]}#{v.rank}
            </StatusBadge>
          </span>
        );
      })}
    </div>
  );
}

// ── Memory Manager Dialog Component ─────────────────────────────────

interface EvolveMementoManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "records" | "relations" | "reflect";
  onTabChange: (tab: "records" | "relations" | "reflect") => void;
  inspector: Stage6MemoryInspector;
  onActivate: (recordId: string) => void;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
}

function EvolveMementoManagerDialog({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  inspector,
  onActivate,
  onForget,
  onPin,
}: EvolveMementoManagerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<string>("all");

  const recordMap = useMemo(() => {
    return new Map<string, MemoryRecord>(inspector.records.map((r) => [r.id, r]));
  }, [inspector.records]);

  const filteredRecords = useMemo(() => {
    return inspector.records.filter((record) => {
      const matchesSearch =
        record.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (record.topic ?? "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesScope = filterScope === "all" || record.scope === filterScope;
      const matchesKind = filterKind === "all" || record.kind === filterKind;

      return matchesSearch && matchesScope && matchesKind;
    });
  }, [inspector.records, searchQuery, filterScope, filterKind]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col bg-card border-border text-foreground">
        <DialogHeader className="border-b border-border pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Database className="h-5 w-5 text-primary" />
            EvolveMemento Memory Manager
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(val) => onTabChange(val as any)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="shrink-0 flex gap-2 border-b border-border pb-1 bg-transparent">
            <TabsTrigger
              value="records"
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-t-md border-b-2 border-transparent transition-all",
                activeTab === "records"
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              기록 관리 ({inspector.records.length})
            </TabsTrigger>
            <TabsTrigger
              value="relations"
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-t-md border-b-2 border-transparent transition-all",
                activeTab === "relations"
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              관계 네트워크 ({inspector.relations.length})
            </TabsTrigger>
            <TabsTrigger
              value="reflect"
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-t-md border-b-2 border-transparent transition-all",
                activeTab === "reflect"
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              리플렉션 이슈 ({inspector.issues.length})
            </TabsTrigger>
          </TabsList>

          {/* 1. Records Tab */}
          <TabsContent value="records" className="flex-1 flex flex-col overflow-hidden p-0 mt-3">
            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-3 mb-3 bg-card/50 p-2.5 rounded-lg border border-border/60 shrink-0">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="기억 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Scope:</span>
                <select
                  value={filterScope}
                  onChange={(e) => setFilterScope(e.target.value)}
                  className="bg-background border border-border/80 rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="all">전체</option>
                  <option value="global">전역 (Global)</option>
                  <option value="project">프로젝트 (Project)</option>
                  <option value="session">세션 (Session)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Kind:</span>
                <select
                  value={filterKind}
                  onChange={(e) => setFilterKind(e.target.value)}
                  className="bg-background border border-border/80 rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="all">전체</option>
                  <option value="architecture">아키텍처</option>
                  <option value="decision">결정</option>
                  <option value="context">맥락</option>
                  <option value="pattern">패턴</option>
                  <option value="workflow">작업흐름</option>
                  <option value="learning">학습</option>
                  <option value="preference">선호</option>
                  <option value="relationship">관계</option>
                </select>
              </div>
            </div>

            {/* Scrollable list */}
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-3">
                {filteredRecords.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">
                    조건에 맞는 기억이 없습니다.
                  </p>
                ) : (
                  filteredRecords.map((record) => (
                    <div
                      key={record.id}
                      className="p-3 bg-card/30 border border-border rounded-lg flex items-start justify-between gap-4 hover:bg-card/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xs font-semibold text-foreground truncate">
                            {record.title}
                          </h4>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-mono">
                            {record.kind}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-mono">
                            {record.scope ?? "auto"}
                          </span>
                          <span className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded uppercase font-mono font-medium",
                            record.trustLevel === "trusted" ? "bg-success/15 text-success" :
                            record.trustLevel === "untrusted" ? "bg-destructive/15 text-destructive animate-pulse" :
                            "bg-warning/15 text-warning",
                          )}>
                            {record.trustLevel}
                          </span>
                          {record.pinned ? (
                            <StatusBadge variant="primary" size="sm" className="gap-0.5">
                              <Pin className="h-2.5 w-2.5 fill-current" />
                              Pinned
                            </StatusBadge>
                          ) : null}
                          {record.activationState === "active" ? (
                            <StatusBadge variant="success" size="sm">
                              Active
                            </StatusBadge>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                          {record.losslessRestatement ?? record.content}
                        </p>
                        {record.topic && (
                          <div className="mt-2 text-[10px] text-primary font-medium flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {record.topic}
                          </div>
                        )}
                      </div>

                      {/* Operations */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Imp: {((record.importance ?? 0.5) * 100).toFixed(0)}%
                        </span>
                        <div className="flex items-center gap-1">
                          {!record.pinned && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1 px-2.5"
                              onClick={() => onPin(record.id)}
                            >
                              <Pin className="h-3 w-3" />
                              Pin
                            </Button>
                          )}
                          {record.activationState !== "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1 px-2.5 text-primary hover:text-primary"
                              onClick={() => onActivate(record.id)}
                            >
                              Activate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-[10px] gap-1 px-2"
                            onClick={() => onForget(record.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Forget
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* 2. Relations Tab */}
          <TabsContent value="relations" className="flex-1 flex flex-col overflow-hidden p-0 mt-3">
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-3">
                {inspector.relations.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">
                    기억들 간에 추출된 관계가 아직 없습니다.
                  </p>
                ) : (
                  inspector.relations.map((relation) => {
                    const fromRecord = recordMap.get(relation.fromRecordId);
                    const toRecord = recordMap.get(relation.toRecordId);

                    return (
                      <div
                        key={relation.id}
                        className="p-3 bg-card/30 border border-border rounded-lg hover:bg-card/50 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/30 pb-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
                            <span className="text-foreground max-w-[240px] truncate" title={fromRecord?.title}>
                              {fromRecord?.title ?? relation.fromRecordId}
                            </span>
                            <span className="text-muted-foreground px-1">➔</span>
                            <span className="text-foreground max-w-[240px] truncate" title={toRecord?.title}>
                              {toRecord?.title ?? relation.toRecordId}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {(relation.confidence * 100).toFixed(0)}% 신뢰
                            </span>
                            <StatusBadge
                              variant={
                                relation.kind === "supports" ? "success" :
                                relation.kind === "contradicts" ? "danger" :
                                "primary"
                              }
                              size="sm"
                              className="uppercase font-mono font-bold"
                            >
                              {relation.kind}
                            </StatusBadge>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {relation.reason}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* 3. Reflect Tab */}
          <TabsContent value="reflect" className="flex-1 flex flex-col overflow-hidden p-0 mt-3">
            <ScrollArea className="flex-1">
              <div className="space-y-3 pr-3">
                {inspector.issues.length === 0 ? (
                  <div className="text-center py-10 bg-card/30 border border-border/80 border-dashed rounded-lg">
                    <Check className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="text-xs font-medium text-foreground">감지된 메모리 충돌이나 정제 대상이 없습니다.</p>
                    <p className="text-[10px] text-muted-foreground mt-1">EvolveMemento의 기억 상태가 아주 건강합니다 (Good).</p>
                  </div>
                ) : (
                  inspector.issues.map((issue) => {
                    const recordsInIssue = issue.recordIds
                      .map((id) => recordMap.get(id))
                      .filter((r): r is MemoryRecord => Boolean(r));

                    return (
                      <div
                        key={issue.id}
                        className={cn(
                          "p-3.5 border rounded-lg hover:shadow-sm transition-all",
                          issue.severity === "high"
                            ? "bg-destructive/5 border-destructive/20"
                            : issue.severity === "medium"
                              ? "bg-warning/5 border-warning/20"
                              : "bg-muted/10 border-border",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-border/20 pb-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={cn(
                              "h-4 w-4 shrink-0",
                              issue.severity === "high" ? "text-destructive animate-pulse" :
                              issue.severity === "medium" ? "text-warning" :
                              "text-muted-foreground",
                            )} />
                            <span className="text-xs font-bold text-foreground">
                              {issue.kind === "duplicate" ? "중복 의심 기억" :
                               issue.kind === "contradiction" ? "상호 모순 발생" :
                               issue.kind === "untrusted_active" ? "비신뢰 기억 활성화 검토" :
                               issue.kind === "stale" ? "오래된 기억 (Stale)" :
                               "누락된 관계 연결"}
                            </span>
                          </div>
                          <StatusBadge
                            variant={
                              issue.severity === "high" ? "danger" :
                              issue.severity === "medium" ? "warning" :
                              "muted"
                            }
                            size="sm"
                            className="uppercase font-mono font-bold"
                          >
                            {issue.severity}
                          </StatusBadge>
                        </div>

                        {/* Impacted memories */}
                        <div className="space-y-1.5 mb-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wide">
                            대상 기억 목록:
                          </span>
                          {recordsInIssue.map((record) => (
                            <div
                              key={record.id}
                              className="text-xs bg-background/50 border border-border/60 rounded px-2.5 py-1.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-foreground block truncate">
                                  {record.title}
                                </span>
                                <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                                  {record.content}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 text-[9px] px-2 gap-1 shrink-0"
                                onClick={() => onForget(record.id)}
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                                Forget
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="bg-card/75 border border-border/40 p-2.5 rounded text-xs text-foreground flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            권장 행동 조치:
                          </span>
                          <span className="leading-relaxed">
                            {issue.recommendation}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Label helpers ────────────────────────────────────────────────────

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
    "untrusted memory is quarantined until pinned":
      "신뢰되지 않은 기억은 고정 전까지 격리됨",
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
