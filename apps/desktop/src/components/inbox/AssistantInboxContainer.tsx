import { useEffect, useMemo, useState } from "react";
import {
  AssistantInbox,
  INBOX_VIEW_MODES,
  type InboxViewMode,
  type InboxCommand,
} from "./AssistantInbox";
import {
  buildAssistantInboxProps,
  buildAssistantInboxLiveProps,
  EVAL_REPORTS_FIXTURE,
  type AssistantInboxLiveInput,
} from "../../lib/assistantInboxProjection";
import { buildLearningMemoryConsole } from "../../lib/learningMemoryConsole";
import { readJsonState, writeJsonState } from "../../lib/persistentJsonState";
import {
  EXAMPLE_SOURCE_SCENARIOS,
  type SourceScenarioKey,
} from "../../lib/plugins/examplePluginSource";
import { projectPluginEvidenceCandidates } from "../../lib/plugins/pluginEvidenceSource";
import { projectPatchCandidates } from "../../lib/plugins/patchCandidateSource";
import { EXAMPLE_PATCH_CANDIDATES } from "../../lib/plugins/examplePatchCandidate";
import {
  projectRunnerTheater,
  EXAMPLE_RUNNER_SESSIONS,
  EXAMPLE_RUNNER_NOW_MS,
} from "../../lib/runnerTheater";
import {
  projectEvidenceDraft,
  EXAMPLE_EVIDENCE_DRAFT,
  EXAMPLE_DRAFT_NOW_MS,
} from "../../lib/evidenceDraft";
import { deriveWorkItemCandidates } from "../../lib/workItemCandidate";

/** LINE A — local UI preference key for the remembered seat (no server write). */
const INBOX_VIEW_MODE_KEY = "ai-orchestrator.inbox-view-mode.v1";

/** Read a remembered seat — only an ENABLED mode counts; else null (→ default). */
function readStoredViewMode(): InboxViewMode | null {
  const stored = readJsonState<string | null>(INBOX_VIEW_MODE_KEY, null, (v) =>
    typeof v === "string" ? v : null,
  );
  if (stored && INBOX_VIEW_MODES.some((m) => m.value === stored && m.enabled)) {
    return stored as InboxViewMode;
  }
  return null;
}

/**
 * LINE B/C/H — Assistant Inbox container.
 *
 * Thin mounting shell. It has two honest modes:
 *
 *   - LIVE (preferred): when a `live` input is provided (even an empty object),
 *     it projects each card from REAL app state via `buildAssistantInboxLiveProps`.
 *     Sources with no real data render an HONEST EMPTY STATE (never a fixture);
 *     the runner gate is always a real derived fact (dgx disabled → observed
 *     false). Evidence stays empty unless `live.includeEvidenceExample` opts into
 *     a clearly-labeled 예시(fixture).
 *
 *   - EXAMPLE (legacy / demo): with NO `live` prop it falls back to the neutral
 *     fixture composition, every section explicitly labeled 예시(fixture).
 *
 * It fires NO callback on mount and triggers no provider/runtime/external call —
 * both projections are pure and memoized so render touches nothing.
 */
export type AssistantInboxContainerProps = {
  /**
   * Real app state. Presence (even `{}`) switches the container to honest LIVE
   * mode. Absence keeps the legacy fixture/example composition.
   */
  live?: AssistantInboxLiveInput;
  /**
   * LINE A — remember the last seat across mounts in localStorage. Local UI
   * preference ONLY (no server / EventStorage write). Off by default so isolated
   * renders stay deterministic; the real app turns it on.
   */
  persistViewMode?: boolean;
  /** Batch 11 LINE C — one-shot view command from the Command Palette (view-only). */
  command?: InboxCommand;
};

export function AssistantInboxContainer({
  live,
  persistViewMode = false,
  command,
}: AssistantInboxContainerProps = {}) {
  // Default seat: LIVE when real app state is wired (the real app always passes
  // `live`, so the command center opens LIVE). It falls back to PREVIEW only in
  // isolation/demo, where there is no live data to honestly show. The seat is
  // pure UI state — switching it never writes anywhere (except the local pref).
  const [mode, setMode] = useState<InboxViewMode>(() => {
    if (persistViewMode) {
      const stored = readStoredViewMode();
      if (stored) return stored; // remembered enabled seat wins
    }
    // No (valid) stored seat → default. Real app (live wired) opens LIVE;
    // isolation/demo opens PREVIEW. Invalid/disabled stored values fall through here.
    return live === undefined ? "preview" : "live";
  });

  // Batch 15 LINE C — PREVIEW-only demo scenario. Pure local UI state; it only
  // selects which generic EXAMPLE fixture deck the PREVIEW seat shows. It never
  // touches LIVE (the pluginExtras LIVE branch ignores it).
  const [sourceScenario, setSourceScenario] = useState<SourceScenarioKey>("mixed");

  // Persist the seat as a local UI preference only when explicitly enabled.
  useEffect(() => {
    if (persistViewMode) writeJsonState(INBOX_VIEW_MODE_KEY, mode);
  }, [persistViewMode, mode]);

  // Batch 11 LINE C — the container owns the seat, so it applies mode commands
  // from the palette (e.g. "Switch to REPLAY"); filter commands flow to the inbox.
  useEffect(() => {
    if (command?.kind === "mode" && command.value) setMode(command.value as InboxViewMode);
    else if (command?.kind === "applyView" && command.view) setMode(command.view.mode);
  }, [command]);

  // DATA-PLANE SEPARATION (Batch 5 LINE S): each seat reads ONE projection and
  // never the other. liveProjection (buildAssistantInboxLiveProps) and
  // previewProjection (buildAssistantInboxProps) are distinct, pure functions;
  // PREVIEW never receives `live`, LIVE never receives fixtures. So no fixture
  // can leak into a live card and vice versa.
  const props = useMemo(() => {
    if (mode === "preview") return buildAssistantInboxProps();
    if (mode === "live") return buildAssistantInboxLiveProps(live ?? {});
    // REPLAY / SANDBOX are disabled placeholders this batch — render an honest
    // empty live frame (no fixtures) until their real sources are wired.
    return buildAssistantInboxLiveProps({});
  }, [mode, live]);

  // LINE A/C — strip extras. LIVE surfaces real event-log/record counts and an
  // honest source label; PREVIEW marks the source as fixture; placeholders none.
  const stripExtras =
    mode === "live"
      ? {
          eventCount: live?.eventLogCount,
          recordCount: live?.projectRecords?.length,
          lastUpdateSource: live?.eventLogCount ? "eventLog" : "no live data",
          // Batch 8 LINE B — real timed events feed the Today/Recent lanes.
          recentEvents: live?.recentEvents,
          nowMs: live?.nowMs,
        }
      : mode === "preview"
        ? { lastUpdateSource: "fixture" }
        : mode === "replay"
          ? {
              // LINE C — replay reads the real eventLog read-only; surface its size
              // and feed the deck. No write/append/activation/server.
              eventCount: live?.recentEvents?.length,
              lastUpdateSource: "replay (read-only)",
              recentEvents: live?.recentEvents,
              nowMs: live?.nowMs,
            }
          : {};

  // Batch 14 LINE D/E — generic Plugin Sources surface (read-only, display-only).
  //   PREVIEW: shows clearly-labeled EXAMPLE plugin fixtures so the seat is a
  //            VISIBLE vertical slice (not just types). Never live, never written.
  //   LIVE:    shows ONLY real plugin input from `live`; absent → honest empty
  //            (no fixture leaks into a live seat).
  //   REPLAY/SANDBOX: no plugin section (honest empty placeholder seats).
  // projectPluginEvidenceCandidates is pure (no execution / import / network):
  // approved/published → suggested(observed:false); draft is dropped; trust never
  // escalates to trusted/active.
  const pluginExtras = useMemo(() => {
    if (mode === "preview") {
      // PREVIEW routes through the selected generic demo scenario (LINE C). Still
      // a clearly-labeled EXAMPLE — never live, never written.
      const deck = EXAMPLE_SOURCE_SCENARIOS[sourceScenario];
      return {
        pluginSources: deck.sources,
        pluginEvidence: projectPluginEvidenceCandidates(deck.evidence),
      };
    }
    if (mode === "live") {
      // LIVE ignores the scenario entirely — only real input, no fixture leak.
      return {
        pluginSources: live?.pluginSources,
        pluginEvidence: projectPluginEvidenceCandidates(live?.pluginEvidence ?? []),
      };
    }
    return { pluginSources: undefined, pluginEvidence: undefined };
  }, [mode, live, sourceScenario]);

  // Batch 17 LINE A — Patch Candidate lane. PREVIEW shows clearly-labeled EXAMPLE
  // candidates; LIVE shows only real input (no fixture leak); REPLAY/SANDBOX none.
  // projectPatchCandidates is pure — read-only, never applies/dispatches.
  const patchExtras = useMemo(() => {
    if (mode === "preview") return { patchCandidates: projectPatchCandidates(EXAMPLE_PATCH_CANDIDATES) };
    if (mode === "live") return { patchCandidates: projectPatchCandidates(live?.patchCandidates ?? []) };
    return { patchCandidates: undefined };
  }, [mode, live]);

  // Engine E2 — Runner Theater. PREVIEW shows clearly-labeled EXAMPLE runner
  // sessions (fixed now → deterministic liveness); LIVE projects ONLY real
  // workbenchMissionStore snapshot passed via live.runnerSessions (honest empty
  // when none); REPLAY/SANDBOX none. projectRunnerTheater is pure/read-only —
  // never starts/dispatches a runner; nowMs is injected (no Date.now here).
  const runnerExtras = useMemo(() => {
    if (mode === "preview")
      return { runnerTheater: projectRunnerTheater(EXAMPLE_RUNNER_SESSIONS, EXAMPLE_RUNNER_NOW_MS) };
    if (mode === "live")
      return {
        runnerTheater: projectRunnerTheater(live?.runnerSessions ?? [], live?.nowMs ?? EXAMPLE_RUNNER_NOW_MS),
      };
    return { runnerTheater: undefined };
  }, [mode, live]);

  // Engine E4A — Evidence Draft LIVE input seam. PREVIEW projects the clearly-
  // labeled EXAMPLE draft (fixed now → deterministic chips); LIVE projects ONLY a
  // real draft passed via live.evidenceDraft (absent → no card, honest empty; no
  // fixture leak); REPLAY/SANDBOX → no card. projectEvidenceDraft is pure/read-only
  // — no producer, no external send, no write. nowMs is injected.
  const evidenceDraftExtras = useMemo(() => {
    if (mode === "preview")
      return { evidenceDraft: projectEvidenceDraft(EXAMPLE_EVIDENCE_DRAFT, EXAMPLE_DRAFT_NOW_MS) };
    if (mode === "live")
      return {
        evidenceDraft: live?.evidenceDraft
          ? projectEvidenceDraft(live.evidenceDraft, live.nowMs ?? EXAMPLE_DRAFT_NOW_MS)
          : undefined,
      };
    return { evidenceDraft: undefined };
  }, [mode, live]);

  // Engine E3 — Learning & Memory console roll-up. Reuses the projected learning
  // loops + memory candidates already in `props` (PREVIEW=fixture / LIVE=real) and
  // the eval reports (PREVIEW fixture; LIVE = real manifest eval, honest-empty when
  // absent). Pure read-only summary — no auto-trust, no runtime load, no write.
  // REPLAY/SANDBOX → no console (honest empty placeholder seats).
  const learningMemoryExtras = useMemo(() => {
    if (mode !== "preview" && mode !== "live") return { learningMemory: undefined };
    const evalMap =
      mode === "preview" ? EVAL_REPORTS_FIXTURE : live?.manifest?.evalReportsByRunId ?? {};
    return {
      learningMemory: buildLearningMemoryConsole({
        learningLoops: props.learningLoops,
        memoryCandidates: props.memoryCandidates,
        evalReports: Object.values(evalMap),
      }),
    };
  }, [mode, props, live]);

  // Engine E5 — WorkItem Candidates: the read-only CENTRAL AXIS. Derives
  // candidate-only objects from the already-projected surfaces (patch / runner /
  // evidence / memory / source health), plus any explicitly-passed LIVE candidate
  // inputs. Pure: deriveWorkItemCandidates creates NOTHING — no append/write/
  // commit/dispatch. PREVIEW reflects the example signals; LIVE reflects only real
  // signals + explicit inputs (honest empty when none). REPLAY/SANDBOX → no card.
  const workItemExtras = useMemo(() => {
    if (mode !== "preview" && mode !== "live") return { workItemCandidates: undefined };
    const sourceHealth = (pluginExtras.pluginSources ?? []).map((s) => ({
      pluginId: s.pluginId,
      health: s.health,
    }));
    return {
      workItemCandidates: deriveWorkItemCandidates({
        patchCandidates: patchExtras.patchCandidates,
        runnerTheater: runnerExtras.runnerTheater,
        evidenceDraft: evidenceDraftExtras.evidenceDraft,
        learningMemory: learningMemoryExtras.learningMemory,
        sourceHealth,
        extra: mode === "live" ? live?.workItemCandidates : undefined,
      }),
    };
  }, [mode, pluginExtras, patchExtras, runnerExtras, evidenceDraftExtras, learningMemoryExtras, live]);

  return (
    <div className="nav-center-page" data-page="command_center" data-safe-bottom="true">
      <AssistantInbox
        {...props}
        {...stripExtras}
        {...pluginExtras}
        {...patchExtras}
        {...runnerExtras}
        {...learningMemoryExtras}
        {...evidenceDraftExtras}
        {...workItemExtras}
        mode={mode}
        onModeChange={setMode}
        persistFilters={persistViewMode}
        command={command}
        sourceScenario={sourceScenario}
        onSourceScenarioChange={setSourceScenario}
      />
    </div>
  );
}
