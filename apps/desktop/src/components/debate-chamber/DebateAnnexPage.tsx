import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Server,
  Users,
  XCircle,
} from "lucide-react";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import type { Stage3DebateSession } from "../../runtime/stage3Runtime";

type AnnexTab = "status" | "evidence" | "agents" | "memory" | "queue" | "logs";

type StatusItem = {
  id: string;
  label: string;
  status?: "critical" | "degraded" | "healthy";
  value: string | number;
};

type EvidenceRef = {
  id: string;
  relevance: "high" | "low" | "medium";
  source: string;
  title: string;
};

type QueueItem = {
  id: string;
  status: "pending" | "ready" | "waiting";
  timestamp: string;
  title: string;
  type: "approval" | "draft" | "task";
};

type LogEntry = {
  id: string;
  level: "error" | "info" | "warn";
  message: string;
  timestamp: string;
};

const tabConfig: Record<AnnexTab, { icon: ElementType; label: string }> = {
  agents: { icon: Users, label: "Agent Relay" },
  evidence: { icon: FileText, label: "Evidence" },
  logs: { icon: Server, label: "Logs" },
  memory: { icon: Database, label: "Memory" },
  queue: { icon: Clock, label: "Queue" },
  status: { icon: Activity, label: "Status Hub" },
};

export function DebateAnnexPage({
  codingPacketGoal,
  className,
  onBack,
  onViewApproval,
  onViewMemory,
  pendingApprovals,
  runtime,
  session,
}: {
  codingPacketGoal?: string;
  className?: string;
  onBack?: () => void;
  onViewApproval?: () => void;
  onViewMemory?: () => void;
  pendingApprovals: number;
  runtime: RuntimeSnapshot;
  session: Stage3DebateSession;
}) {
  const [activeTab, setActiveTab] = useState<AnnexTab>("status");
  const now = useNow();

  const data = useMemo(
    () => ({
      agentRelay: session.humanPeek.map((entry) => ({
        actor: entry.actor,
        action: entry.kind,
        target: entry.target,
        timestamp: formatRelativeTime(entry.createdAt, now),
      })),
      evidenceRefs: buildEvidenceRefs(session),
      logs: buildLogs(session, runtime, now),
      memoryRecall: session.contextPreview.map((value, index) => ({
        confidence: Math.max(62, 94 - index * 7),
        key: `context-${index + 1}`,
        value,
      })),
      queueItems: buildQueueItems({ codingPacketGoal, pendingApprovals, session }),
      statusHub: buildStatusItems(session, runtime),
    }),
    [codingPacketGoal, pendingApprovals, runtime, session, now],
  );

  return (
    <section
      className={cn("flex h-full flex-col bg-transparent text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50", className)}
      data-focus-id="debate-annex-container"
      tabIndex={-1}
    >
      <header className="shrink-0 border-b border-zinc-800/60 bg-zinc-900/30 px-4 py-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-4">
          {onBack ? (
            <Button className="h-8 w-8" onClick={onBack} size="icon" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Debate Annex
              </span>
            </div>
            <h1 className="mt-1 truncate text-sm font-medium text-zinc-100">
              {session.problem}
            </h1>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 overflow-x-auto">
          {(Object.entries(tabConfig) as [AnnexTab, (typeof tabConfig)[AnnexTab]][]).map(([key, config]) => {
            const Icon = config.icon;
            const hasData = getTabHasData(key, data);
            return (
              <button
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === key
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-100",
                  !hasData && "opacity-50",
                )}
                key={key}
                onClick={() => setActiveTab(key)}
                type="button"
              >
                <Icon className="h-3.5 w-3.5" />
                {config.label}
              </button>
            );
          })}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-4xl">
          {activeTab === "status" ? <StatusHubPanel items={data.statusHub} /> : null}
          {activeTab === "evidence" ? <EvidencePanel refs={data.evidenceRefs} /> : null}
          {activeTab === "agents" ? <AgentRelayPanel relay={data.agentRelay} /> : null}
          {activeTab === "memory" ? <MemoryPanel recall={data.memoryRecall} onViewMemory={onViewMemory} /> : null}
          {activeTab === "queue" ? <QueuePanel items={data.queueItems} onViewApproval={onViewApproval} /> : null}
          {activeTab === "logs" ? <LogsPanel entries={data.logs} /> : null}
        </div>
      </div>
    </section>
  );
}

function buildStatusItems(session: Stage3DebateSession, runtime: RuntimeSnapshot): StatusItem[] {
  return [
    ...session.statusHub.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.tone === "danger" ? "critical" as const : item.tone === "warn" ? "degraded" as const : "healthy" as const,
      value: item.value,
    })),
    {
      id: "authority",
      label: "Authority",
      status: "healthy",
      value: runtime.syncTopology.authorityLabel,
    },
    {
      id: "memory-sync",
      label: "Memory Sync",
      status: runtime.memorySyncStatus === "online" ? "healthy" : "degraded",
      value: runtime.memorySyncStatus,
    },
  ];
}

function buildEvidenceRefs(session: Stage3DebateSession): EvidenceRef[] {
  const refs = new Map<string, EvidenceRef>();
  for (const round of session.rounds) {
    for (const utterance of round.utterances) {
      for (const id of utterance.evidenceRefIds ?? []) {
        refs.set(id, {
          id,
          relevance: utterance.tags.includes("risk") ? "high" : "medium",
          source: round.title,
          title: id,
        });
      }
      for (const id of utterance.codingImpactRefs ?? []) {
        refs.set(id, {
          id,
          relevance: "high",
          source: `${round.title} · coding impact`,
          title: id,
        });
      }
      if (utterance.decisionId) {
        refs.set(utterance.decisionId, {
          id: utterance.decisionId,
          relevance: "high",
          source: `${round.title} · decision`,
          title: utterance.decisionId,
        });
      }
    }
  }
  return [...refs.values()];
}

function buildQueueItems({
  codingPacketGoal,
  pendingApprovals,
  session,
}: {
  codingPacketGoal?: string;
  pendingApprovals: number;
  session: Stage3DebateSession;
}): QueueItem[] {
  const items: QueueItem[] = [];
  if (pendingApprovals > 0) {
    items.push({
      id: "permission-queue",
      status: "pending",
      timestamp: "now",
      title: `${pendingApprovals} approval item(s) waiting`,
      type: "approval",
    });
  }
  if (codingPacketGoal) {
    items.push({
      id: "coding-packet",
      status: "ready",
      timestamp: "ready",
      title: codingPacketGoal,
      type: "draft",
    });
  }
  items.push({
    id: "debate-rounds",
    status: "waiting",
    timestamp: `${session.rounds.length} rounds`,
    title: "Round outputs available for inspection",
    type: "task",
  });
  return items;
}

function buildLogs(session: Stage3DebateSession, runtime: RuntimeSnapshot, now: number): LogEntry[] {
  return [
    {
      id: "promoted",
      level: "info",
      message: `Debate promoted from conversation at ${new Date(session.promotedAt).toLocaleString("ko-KR")}`,
      timestamp: formatRelativeTime(session.promotedAt, now),
    },
    {
      id: "runtime",
      level: runtime.recentError ? "error" : "info",
      message: runtime.recentError ?? `Runtime updated at ${new Date(runtime.updatedAt).toLocaleString("ko-KR")}`,
      timestamp: formatRelativeTime(runtime.updatedAt, now),
    },
    ...session.humanPeek.map((entry) => ({
      id: entry.id,
      level: entry.state === "blocked" ? "warn" as const : "info" as const,
      message: `${entry.actor} ${entry.kind} ${entry.target}: ${entry.summary}`,
      timestamp: formatRelativeTime(entry.createdAt, now),
    })),
  ];
}

function getTabHasData(tab: AnnexTab, data: ReturnType<typeof buildAnnexShape>): boolean {
  switch (tab) {
    case "agents":
      return data.agentRelay.length > 0;
    case "evidence":
      return data.evidenceRefs.length > 0;
    case "logs":
      return data.logs.length > 0;
    case "memory":
      return data.memoryRecall.length > 0;
    case "queue":
      return data.queueItems.length > 0;
    case "status":
      return data.statusHub.length > 0;
    default:
      return false;
  }
}

function buildAnnexShape() {
  return {
    agentRelay: [] as { actor: string; action: string; target: string; timestamp: string }[],
    evidenceRefs: [] as EvidenceRef[],
    logs: [] as LogEntry[],
    memoryRecall: [] as { confidence: number; key: string; value: string }[],
    queueItems: [] as QueueItem[],
    statusHub: [] as StatusItem[],
  };
}

function StatusHubPanel({ items }: { items: StatusItem[] }) {
  if (!items.length) return <EmptyState icon={Activity} message="No status data available" />;

  const statusColor = {
    critical: "text-rose-400",
    degraded: "text-amber-400",
    healthy: "text-emerald-400",
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4" key={item.id}>
          <p className="text-xs text-zinc-500">{item.label}</p>
          <p className={cn("mt-1 text-lg font-semibold", item.status ? statusColor[item.status] : "text-zinc-100")}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function EvidencePanel({ refs }: { refs: EvidenceRef[] }) {
  if (!refs.length) return <EmptyState icon={FileText} message="No evidence references" />;

  const relevanceColor = {
    high: "border-l-emerald-500",
    low: "border-l-zinc-600",
    medium: "border-l-amber-500",
  };

  return (
    <div className="space-y-3">
      {refs.map((ref) => (
        <div
          className={cn("rounded-lg border border-zinc-800/60 border-l-2 bg-zinc-900/40 p-4", relevanceColor[ref.relevance])}
          key={ref.id}
        >
          <p className="text-sm font-medium text-zinc-100">{ref.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{ref.source}</p>
        </div>
      ))}
    </div>
  );
}

function AgentRelayPanel({
  relay,
}: {
  relay: { actor: string; action: string; target: string; timestamp: string }[];
}) {
  if (!relay.length) return <EmptyState icon={Users} message="No agent relay activity" />;

  return (
    <div className="space-y-2">
      {relay.map((item, index) => (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3" key={`${item.actor}-${index}`}>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium text-cyan-400">{item.actor}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
            <span className="text-zinc-500">{item.action}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
            <span className="truncate font-medium text-violet-400">{item.target}</span>
          </div>
          <span className="ml-auto shrink-0 text-[10px] text-zinc-500">{item.timestamp}</span>
        </div>
      ))}
    </div>
  );
}

function MemoryPanel({
  recall,
  onViewMemory,
}: {
  recall: { confidence: number; key: string; value: string }[];
  onViewMemory?: () => void;
}) {
  if (!recall.length) return <EmptyState icon={Database} message="No memory recalls" />;

  return (
    <div className="space-y-3">
      {recall.map((item) => (
        <div
          className={cn(
            "rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 transition-colors text-left w-full block",
            onViewMemory &&
              "cursor-pointer hover:border-cyan-500/30 hover:bg-zinc-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          )}
          key={item.key}
          onClick={onViewMemory}
          onKeyDown={(e) => {
            if (onViewMemory && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onViewMemory();
            }
          }}
          role={onViewMemory ? "button" : undefined}
          tabIndex={onViewMemory ? 0 : undefined}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-cyan-400">{item.key}</p>
            <span className="text-xs text-zinc-500">{item.confidence}%</span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm text-zinc-300">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function QueuePanel({
  items,
  onViewApproval,
}: {
  items: QueueItem[];
  onViewApproval?: () => void;
}) {
  if (!items.length) return <EmptyState icon={Clock} message="Queue is empty" />;

  const statusIcon = {
    pending: AlertTriangle,
    ready: CheckCircle2,
    waiting: Clock,
  };
  const statusColor = {
    pending: "text-amber-400",
    ready: "text-emerald-400",
    waiting: "text-zinc-400",
  };

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = statusIcon[item.status];
        const isClickable = item.type === "approval" && onViewApproval;
        return (
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3 transition-colors text-left w-full",
              isClickable &&
                "cursor-pointer hover:border-amber-500/30 hover:bg-zinc-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
            )}
            key={item.id}
            onClick={isClickable ? onViewApproval : undefined}
            onKeyDown={(e) => {
              if (isClickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onViewApproval();
              }
            }}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
          >
            <Icon className={cn("h-4 w-4", statusColor[item.status])} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-100">{item.title}</p>
              <p className="text-xs text-zinc-500">{item.type}</p>
            </div>
            <span className="text-[10px] text-zinc-500">{item.timestamp}</span>
          </div>
        );
      })}
    </div>
  );
}

function LogsPanel({ entries }: { entries: LogEntry[] }) {
  if (!entries.length) return <EmptyState icon={Server} message="No logs available" />;

  const levelColor = {
    error: "text-rose-400",
    info: "text-cyan-400",
    warn: "text-amber-400",
  };
  const levelIcon = {
    error: XCircle,
    info: CheckCircle2,
    warn: AlertTriangle,
  };

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const Icon = levelIcon[entry.level];
        return (
          <div className="flex items-start gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3" key={entry.id}>
            <Icon className={cn("mt-0.5 h-4 w-4", levelColor[entry.level])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-300">{entry.message}</p>
              <p className="mt-1 text-[10px] text-zinc-500">{entry.timestamp}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: ElementType; message: string }) {
  return (
    <div className="py-12 text-center">
      <Icon className="mx-auto h-8 w-8 text-zinc-700" />
      <p className="mt-2 text-sm text-zinc-500">{message}</p>
    </div>
  );
}

function formatRelativeTime(value: string, now: number) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;
  const delta = now - timestamp;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function useNow(updateIntervalMs = 60000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), updateIntervalMs);
    return () => clearInterval(interval);
  }, [updateIntervalMs]);
  return now;
}
