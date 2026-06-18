import type { EvidenceDraft } from "./evidenceDraft";
import type { LearningMemoryConsole } from "./learningMemoryConsole";
import type { PatchCandidate } from "./plugins/patchCandidateSource";
import type { RunnerTheaterRow } from "./runnerTheater";
import type { WorkItemCandidate } from "./workItemCandidate";

/**
 * Mission Operations Theater PR1 — pure read-only operation map projection.
 *
 * This module only composes already-present projections. It does not resolve
 * refs beyond the rows passed in, and unresolved refs stay explicit.
 */

export type MissionOperationNodeKind =
  | "mission"
  | "runner"
  | "patch"
  | "candidate"
  | "evidence"
  | "memory"
  | "source";

export type MissionOperationState =
  | "active"
  | "attention"
  | "ready"
  | "blocked"
  | "evidence-missing"
  | "memory-warning"
  | "unknown";

export type MissionOperationEdgeKind =
  | "mission"
  | "runner"
  | "patch"
  | "candidate"
  | "evidence"
  | "memory"
  | "source";

export type MissionOperationsSourceHealth = {
  pluginId: string;
  health: string;
  generatedAt?: string;
};

export type MissionOperationsReplayEvent = {
  id: string;
  title: string;
  category: string;
  source: string;
  createdAt?: string;
};

export type MissionOperationsInput = {
  runnerTheater?: ReadonlyArray<RunnerTheaterRow>;
  patchCandidates?: ReadonlyArray<PatchCandidate>;
  workItemCandidates?: ReadonlyArray<WorkItemCandidate>;
  evidenceDraft?: EvidenceDraft;
  learningMemory?: LearningMemoryConsole;
  sourceHealth?: ReadonlyArray<MissionOperationsSourceHealth>;
  replayEvents?: ReadonlyArray<MissionOperationsReplayEvent>;
};

export type MissionOperationNode = {
  id: string;
  kind: MissionOperationNodeKind;
  ref: string;
  label: string;
  state: MissionOperationState;
  timestamp?: string;
  reason?: string;
  note: string;
};

export type MissionOperationEdge = {
  id: string;
  from: string;
  to: string;
  kind: MissionOperationEdgeKind;
  ref: string;
  refStatus: "matched-ref";
};

export type MissionOperationUnresolvedRef = {
  ownerId: string;
  ownerKind: MissionOperationNodeKind;
  ref: string;
  expectedKind: MissionOperationNodeKind;
  reason: string;
};

export type MissionOperationsMap = {
  nodes: MissionOperationNode[];
  edges: MissionOperationEdge[];
  unresolvedRefs: MissionOperationUnresolvedRef[];
  note: string;
};

export type MissionOperationsSummary = Record<MissionOperationState, number> & {
  totalNodes: number;
  totalEdges: number;
  unresolvedRefs: number;
  evidenceMissing: number;
  memoryWarning: number;
  byKind: Record<MissionOperationNodeKind, number>;
};

export type MissionOperationsGroups = Record<MissionOperationState, MissionOperationNode[]>;

const NODE_KIND_ORDER: Record<MissionOperationNodeKind, number> = {
  mission: 0,
  runner: 1,
  patch: 2,
  candidate: 3,
  evidence: 4,
  memory: 5,
  source: 6,
};

const EMPTY_SUMMARY: MissionOperationsSummary = {
  active: 0,
  attention: 0,
  ready: 0,
  blocked: 0,
  "evidence-missing": 0,
  "memory-warning": 0,
  unknown: 0,
  totalNodes: 0,
  totalEdges: 0,
  unresolvedRefs: 0,
  evidenceMissing: 0,
  memoryWarning: 0,
  byKind: {
    mission: 0,
    runner: 0,
    patch: 0,
    candidate: 0,
    evidence: 0,
    memory: 0,
    source: 0,
  },
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanRefs(refs: ReadonlyArray<string> | undefined): string[] {
  return Array.from(new Set((refs ?? []).map((ref) => ref.trim()).filter(Boolean)));
}

function nodeId(kind: MissionOperationNodeKind, ref: string): string {
  return `${kind}:${ref}`;
}

function nodeNote(): string {
  return "mission operations · read-only · ref-only";
}

function sourceState(health: string): MissionOperationState {
  if (health === "error") return "blocked";
  if (health === "stale") return "attention";
  if (health === "connected") return "ready";
  return "unknown";
}

function patchState(patch: PatchCandidate): MissionOperationState {
  if (patch.safetyStatus === "blocked") return "blocked";
  if (patch.safetyStatus === "warning" || !patch.observed) return "attention";
  return "ready";
}

function runnerState(row: RunnerTheaterRow): MissionOperationState {
  if (row.lane === "active" && row.liveness !== "stale") return "active";
  if (row.lane === "attention" || row.liveness === "stale") return "attention";
  if (row.lane === "done") return "ready";
  return "unknown";
}

function candidateState(candidate: WorkItemCandidate): MissionOperationState {
  if (candidate.status === "blocked" || candidate.risk === "high") return "blocked";
  if (candidate.evidenceRefs.length === 0) return "evidence-missing";
  if (candidate.observed) return "ready";
  if (candidate.lane === "now") return "attention";
  return "unknown";
}

function evidenceState(footnote: EvidenceDraft["footnotes"][number]): MissionOperationState {
  if (footnote.freshness === "stale" || footnote.freshness === "unknown") return "attention";
  return "ready";
}

function memoryState(console: LearningMemoryConsole): MissionOperationState {
  if (
    console.flags.length > 0 ||
    console.evalHealth.fail > 0 ||
    console.evalHealth.blocked > 0 ||
    console.evalHealth.staleHits > 0 ||
    console.evalHealth.contradictedHits > 0 ||
    console.evalHealth.forbiddenHits > 0
  ) {
    return "memory-warning";
  }
  return console.hasData ? "ready" : "unknown";
}

function sortNodes(nodes: Iterable<MissionOperationNode>): MissionOperationNode[] {
  return [...nodes].sort(
    (a, b) =>
      NODE_KIND_ORDER[a.kind] - NODE_KIND_ORDER[b.kind] ||
      (a.timestamp ?? "").localeCompare(b.timestamp ?? "") ||
      a.ref.localeCompare(b.ref),
  );
}

function sortByRef<T extends { id?: string; candidateId?: string; pluginId?: string; refId?: string }>(
  rows: ReadonlyArray<T> | undefined,
  pick: (row: T) => string,
): T[] {
  return [...(rows ?? [])].sort((a, b) => pick(a).localeCompare(pick(b)));
}

export function buildMissionOperationsMap(input: MissionOperationsInput = {}): MissionOperationsMap {
  const nodes = new Map<string, MissionOperationNode>();
  const edges: Array<MissionOperationEdge & { order: number }> = [];
  const unresolvedRefs: Array<MissionOperationUnresolvedRef & { order: number }> = [];
  let edgeOrder = 0;
  let unresolvedOrder = 0;

  const addNode = (node: MissionOperationNode): void => {
    if (!node.ref || nodes.has(node.id)) return;
    nodes.set(node.id, node);
  };

  const addMission = (ref: string, label?: string, timestamp?: string): void => {
    const id = nodeId("mission", ref);
    addNode({
      id,
      kind: "mission",
      ref,
      label: label ?? ref,
      state: "ready",
      timestamp,
      note: nodeNote(),
    });
  };

  const addEdge = (
    from: string,
    to: string,
    kind: MissionOperationEdgeKind,
    ref: string,
  ): void => {
    if (!nodes.has(from) || !nodes.has(to)) return;
    edges.push({
      id: `${from}->${to}:${kind}:${ref}`,
      from,
      to,
      kind,
      ref,
      refStatus: "matched-ref",
      order: edgeOrder++,
    });
  };

  const addUnresolved = (
    ownerId: string,
    ownerKind: MissionOperationNodeKind,
    ref: string,
    expectedKind: MissionOperationNodeKind,
    reason: string,
  ): void => {
    if (!ref) return;
    unresolvedRefs.push({ ownerId, ownerKind, ref, expectedKind, reason, order: unresolvedOrder++ });
  };

  const runners = sortByRef(input.runnerTheater, (row) => row.id);
  const patches = sortByRef(input.patchCandidates, (row) => row.candidateId);
  const candidates = sortByRef(input.workItemCandidates, (row) => row.id);
  const sources = sortByRef(input.sourceHealth, (row) => row.pluginId);
  const footnotes = [...(input.evidenceDraft?.footnotes ?? [])].sort((a, b) =>
    a.refId.localeCompare(b.refId),
  );

  for (const row of runners) {
    const ref = clean(row.id);
    if (!ref) continue;
    addMission(ref, row.title, row.heartbeatAt);
    addNode({
      id: nodeId("runner", ref),
      kind: "runner",
      ref,
      label: row.title,
      state: runnerState(row),
      timestamp: row.heartbeatAt,
      reason: `${row.status} · ${row.liveness}`,
      note: nodeNote(),
    });
  }

  for (const patch of patches) {
    const missionId = clean(patch.missionId);
    if (missionId) addMission(missionId, missionId, patch.createdAt);
    const ref = clean(patch.candidateId);
    if (!ref) continue;
    addNode({
      id: nodeId("patch", ref),
      kind: "patch",
      ref,
      label: `patch ${ref}`,
      state: patchState(patch),
      timestamp: patch.createdAt,
      reason: `patch safety ${patch.safetyStatus}`,
      note: nodeNote(),
    });
  }

  for (const candidate of candidates) {
    const ref = clean(candidate.id);
    if (!ref) continue;
    addNode({
      id: nodeId("candidate", ref),
      kind: "candidate",
      ref,
      label: candidate.title,
      state: candidateState(candidate),
      timestamp: candidate.createdAt,
      reason: candidate.reason,
      note: nodeNote(),
    });
  }

  for (const footnote of footnotes) {
    const ref = clean(footnote.refId);
    if (!ref) continue;
    addNode({
      id: nodeId("evidence", ref),
      kind: "evidence",
      ref,
      label: footnote.label,
      state: evidenceState(footnote),
      reason: `freshness ${footnote.freshness}`,
      note: nodeNote(),
    });
  }

  if (input.learningMemory?.hasData) {
    addNode({
      id: nodeId("memory", "learning-memory-console"),
      kind: "memory",
      ref: "learning-memory-console",
      label: "Learning / Memory Console",
      state: memoryState(input.learningMemory),
      reason: input.learningMemory.flags[0] ?? "learning/memory aggregate present",
      note: nodeNote(),
    });
  }

  for (const source of sources) {
    const ref = clean(source.pluginId);
    if (!ref) continue;
    addNode({
      id: nodeId("source", ref),
      kind: "source",
      ref,
      label: ref,
      state: sourceState(source.health),
      timestamp: source.generatedAt,
      reason: `source health ${source.health}`,
      note: nodeNote(),
    });
  }

  const runnerByRef = new Map<string, string>();
  for (const row of runners) {
    const id = nodeId("runner", row.id);
    if (!nodes.has(id)) continue;
    runnerByRef.set(row.id, id);
    if (row.branch) runnerByRef.set(row.branch, id);
  }

  const patchByRef = new Map<string, string>();
  for (const patch of patches) {
    const id = nodeId("patch", patch.candidateId);
    if (!nodes.has(id)) continue;
    patchByRef.set(patch.candidateId, id);
    patchByRef.set(patch.id, id);
  }

  const missionByRef = new Map<string, string>();
  for (const node of nodes.values()) if (node.kind === "mission") missionByRef.set(node.ref, node.id);

  const evidenceByRef = new Map<string, string>();
  for (const node of nodes.values()) if (node.kind === "evidence") evidenceByRef.set(node.ref, node.id);

  const sourceByRef = new Map<string, string>();
  for (const node of nodes.values()) if (node.kind === "source") sourceByRef.set(node.ref, node.id);

  for (const row of runners) {
    const from = runnerByRef.get(row.id);
    const to = missionByRef.get(row.id);
    if (from && to) addEdge(from, to, "mission", row.id);
  }

  for (const patch of patches) {
    const from = patchByRef.get(patch.candidateId);
    if (!from) continue;
    const mission = missionByRef.get(patch.missionId);
    const runner = runnerByRef.get(patch.runnerId);
    if (mission) addEdge(from, mission, "mission", patch.missionId);
    else addUnresolved(from, "patch", patch.missionId, "mission", "mission ref unresolved");
    if (runner) addEdge(from, runner, "runner", patch.runnerId);
    else addUnresolved(from, "patch", patch.runnerId, "runner", "runner ref unresolved");
    for (const ref of cleanRefs(patch.evidenceRefs)) {
      const evidence = evidenceByRef.get(ref);
      if (evidence) addEdge(from, evidence, "evidence", ref);
      else addUnresolved(from, "patch", ref, "evidence", "evidence ref unresolved");
    }
  }

  for (const candidate of candidates) {
    const from = nodeId("candidate", candidate.id);
    if (!nodes.has(from)) continue;
    for (const ref of cleanRefs(candidate.sourceRefs)) {
      const patch = patchByRef.get(ref);
      const runner = runnerByRef.get(ref);
      const mission = missionByRef.get(ref);
      const source = sourceByRef.get(ref);
      if (patch) addEdge(from, patch, "patch", ref);
      else if (runner) addEdge(from, runner, "runner", ref);
      else if (source) addEdge(from, source, "source", ref);
      else if (mission) addEdge(from, mission, "mission", ref);
      else addUnresolved(from, "candidate", ref, "source", "source ref unresolved");
    }
    for (const ref of cleanRefs(candidate.evidenceRefs)) {
      const evidence = evidenceByRef.get(ref);
      if (evidence) addEdge(from, evidence, "evidence", ref);
      else addUnresolved(from, "candidate", ref, "evidence", "evidence ref unresolved");
    }
  }

  const memoryNodeId = nodeId("memory", "learning-memory-console");
  if (nodes.has(memoryNodeId)) {
    for (const candidate of candidates) {
      const to = nodeId("candidate", candidate.id);
      if (nodes.has(to)) addEdge(memoryNodeId, to, "memory", candidate.id);
    }
  }

  const dedupedEdges = new Map<string, MissionOperationEdge & { order: number }>();
  for (const edge of edges) if (!dedupedEdges.has(edge.id)) dedupedEdges.set(edge.id, edge);

  const dedupedUnresolved = new Map<string, MissionOperationUnresolvedRef & { order: number }>();
  for (const item of unresolvedRefs) {
    const id = `${item.ownerId}:${item.expectedKind}:${item.ref}`;
    if (!dedupedUnresolved.has(id)) dedupedUnresolved.set(id, item);
  }

  return {
    nodes: sortNodes(nodes.values()),
    edges: [...dedupedEdges.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...edge }) => edge),
    unresolvedRefs: [...dedupedUnresolved.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...item }) => item),
    note: nodeNote(),
  };
}

export function summarizeMissionOperations(map: MissionOperationsMap): MissionOperationsSummary {
  const summary: MissionOperationsSummary = {
    ...EMPTY_SUMMARY,
    byKind: { ...EMPTY_SUMMARY.byKind },
    totalNodes: map.nodes.length,
    totalEdges: map.edges.length,
    unresolvedRefs: map.unresolvedRefs.length,
  };
  for (const node of map.nodes) {
    summary[node.state] += 1;
    if (node.state === "memory-warning") summary.attention += 1;
    summary.byKind[node.kind] += 1;
  }
  summary.evidenceMissing = summary["evidence-missing"];
  summary.memoryWarning = summary["memory-warning"];
  return summary;
}

export function groupMissionOperationsByState(map: MissionOperationsMap): MissionOperationsGroups {
  const groups: MissionOperationsGroups = {
    active: [],
    attention: [],
    ready: [],
    blocked: [],
    "evidence-missing": [],
    "memory-warning": [],
    unknown: [],
  };
  for (const node of map.nodes) {
    groups[node.state].push(node);
    if (node.state === "memory-warning") groups.attention.push(node);
  }
  for (const key of Object.keys(groups) as MissionOperationState[]) {
    groups[key] = sortNodes(groups[key]);
  }
  return groups;
}
