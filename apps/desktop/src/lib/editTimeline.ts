export type EditTimelineSource =
  | "preview"
  | "turbo_edits"
  | "search_replace"
  | "scaffold_overlay"
  | "visual_qa"
  | "fix_verification";

export type EditTimelineStatus =
  | "captured"
  | "requested"
  | "preview"
  | "generated"
  | "invalid"
  | "failed"
  | "no_confident_edits"
  | "applied"
  | "observed";

export type EditTimelineKind =
  | "preview_annotation_captured"
  | "turbo_prompt_generated"
  | "provider_draft_generated"
  | "provider_draft_invalid"
  | "provider_draft_failed"
  | "provider_draft_no_confident_edits"
  | "search_replace_preview_created"
  | "scaffold_overlay_applied"
  | "preview_rerun"
  | "visual_qa_rerun"
  | "fix_verification_observed"
  | "fix_verification_failed";

export type EditHistoryEvent = {
  id: string;
  kind: EditTimelineKind;
  source: EditTimelineSource;
  status: EditTimelineStatus;
  timestamp: string;
  affectedFiles?: ReadonlyArray<string>;
  summary: string;
  /**
   * Internal restore payload for "마지막 적용 patch 보기".
   * Renderers must not display this raw text.
   */
  restoreText?: string;
};

export type EditTimelineItem = EditHistoryEvent & {
  affectedFiles: ReadonlyArray<string>;
};

function compactSummary(summary: string): string {
  const oneLine = summary.replace(/\s+/g, " ").trim();
  return oneLine.length <= 160 ? oneLine : `${oneLine.slice(0, 157)}...`;
}

function uniqueFiles(files: ReadonlyArray<string> | undefined): ReadonlyArray<string> {
  if (!files) return [];
  return Array.from(new Set(files.map((file) => file.trim()).filter(Boolean))).slice(0, 8);
}

export function buildEditTimeline(events: ReadonlyArray<EditHistoryEvent>): ReadonlyArray<EditTimelineItem> {
  return [...events]
    .sort((a, b) => {
      const byTime = Date.parse(a.timestamp) - Date.parse(b.timestamp);
      return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
    })
    .map((event) => ({
      id: event.id,
      kind: event.kind,
      source: event.source,
      status: event.status,
      timestamp: event.timestamp,
      affectedFiles: uniqueFiles(event.affectedFiles),
      summary: compactSummary(event.summary),
      restoreText: typeof event.restoreText === "string" ? event.restoreText : undefined,
    }));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayOfStrings(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function timestamp(payload: Record<string, unknown>): string {
  return stringValue(payload.ts) ?? stringValue(payload.capturedAt) ?? new Date().toISOString();
}

function countLabel(value: unknown, fallback = 0): number {
  return numberValue(value) ?? fallback;
}

export function editHistoryEventFromContext(
  type: string,
  payload: Record<string, unknown>,
): EditHistoryEvent | null {
  const ts = timestamp(payload);
  if (type === "mission.preview_annotation.added") {
    const annotationId = stringValue(payload.id) ?? "manual";
    const files = stringValue(payload.targetFile) ? [stringValue(payload.targetFile)!] : [];
    return {
      id: `preview-annotation-${annotationId}`,
      kind: "preview_annotation_captured",
      source: "preview",
      status: "captured",
      timestamp: ts,
      affectedFiles: files,
      summary: stringValue(payload.summary) ?? "Preview annotation captured",
    };
  }
  if (type === "mission.turbo_edits.generate_clicked" || type === "mission.turbo_edits.prompt_copied") {
    return {
      id: "turbo-prompt-generated",
      kind: "turbo_prompt_generated",
      source: "turbo_edits",
      status: "requested",
      timestamp: ts,
      summary: `Turbo Edits prompt ready · included ${countLabel(payload.includedFiles)} files`,
    };
  }
  if (type === "mission.turbo_edits.generate_injected") {
    const files = arrayOfStrings(payload.filePaths);
    return {
      id: "turbo-draft-generated",
      kind: "provider_draft_generated",
      source: "turbo_edits",
      status: "generated",
      timestamp: ts,
      affectedFiles: files,
      summary: `Provider draft generated · ${countLabel(payload.blockCount)} SEARCH/REPLACE blocks`,
    };
  }
  if (type === "mission.turbo_edits.generate_invalid") {
    return {
      id: "turbo-draft-invalid",
      kind: "provider_draft_invalid",
      source: "turbo_edits",
      status: "invalid",
      timestamp: ts,
      summary: `Provider draft invalid · ${stringValue(payload.reason) ?? "validation failed"}`,
    };
  }
  if (type === "mission.turbo_edits.generate_failed") {
    return {
      id: "turbo-draft-failed",
      kind: "provider_draft_failed",
      source: "turbo_edits",
      status: "failed",
      timestamp: ts,
      summary: `Provider draft failed · ${stringValue(payload.reason) ?? "unknown"}`,
    };
  }
  if (type === "mission.turbo_edits.generate_no_edits") {
    return {
      id: "turbo-draft-no-confident-edits",
      kind: "provider_draft_no_confident_edits",
      source: "turbo_edits",
      status: "no_confident_edits",
      timestamp: ts,
      summary: "Provider returned NO_CONFIDENT_EDITS",
    };
  }
  if (type === "mission.search_replace.preview_created") {
    const files = arrayOfStrings(payload.paths);
    return {
      id: "search-replace-preview",
      kind: "search_replace_preview_created",
      source: "search_replace",
      status: "preview",
      timestamp: ts,
      affectedFiles: files,
      summary: `Search/Replace preview · applies ${countLabel(payload.appliedBlocks)} blocks, fails ${countLabel(payload.failedBlocks)} blocks`,
    };
  }
  if (type === "mission.search_replace.applied") {
    const files = arrayOfStrings(payload.paths);
    return {
      id: "search-replace-applied",
      kind: "scaffold_overlay_applied",
      source: "scaffold_overlay",
      status: "applied",
      timestamp: ts,
      affectedFiles: files,
      summary: `Scaffold overlay applied · ${countLabel(payload.fileCount, files.length)} files`,
      restoreText: stringValue(payload.patchText),
    };
  }
  if (type === "appfix.patch.applied") {
    const files = arrayOfStrings(payload.paths);
    return {
      id: "appfix-overlay-applied",
      kind: "scaffold_overlay_applied",
      source: "scaffold_overlay",
      status: "applied",
      timestamp: ts,
      affectedFiles: files,
      summary: `AppFix overlay applied · ${countLabel(payload.fileCount, files.length)} files`,
    };
  }
  if (type === "mission.preview.run-scaffold.requested") {
    return {
      id: "preview-rerun-requested",
      kind: "preview_rerun",
      source: "preview",
      status: "requested",
      timestamp: ts,
      summary: "Preview rerun requested",
    };
  }
  if (type === "mission.preview.run-scaffold.observed") {
    return {
      id: "preview-rerun-observed",
      kind: "preview_rerun",
      source: "preview",
      status: "observed",
      timestamp: ts,
      summary: `Preview observed · ${stringValue(payload.url) ?? "URL recorded"}`,
    };
  }
  if (type === "mission.preview.run-scaffold.failed") {
    return {
      id: "preview-rerun-failed",
      kind: "preview_rerun",
      source: "preview",
      status: "failed",
      timestamp: ts,
      summary: `Preview rerun failed · ${stringValue(payload.summary) ?? stringValue(payload.reason) ?? "unknown"}`,
    };
  }
  if (type === "mission.visual_qa.requested") {
    return {
      id: "visual-qa-rerun-requested",
      kind: "visual_qa_rerun",
      source: "visual_qa",
      status: "requested",
      timestamp: ts,
      summary: "Visual QA rerun requested",
    };
  }
  if (type === "mission.visual_qa.observed") {
    return {
      id: "visual-qa-rerun-observed",
      kind: "visual_qa_rerun",
      source: "visual_qa",
      status: "observed",
      timestamp: ts,
      summary: `Visual QA observed · status ${stringValue(payload.status) ?? "unknown"} · issues ${countLabel(payload.issueCount)}`,
    };
  }
  if (type === "mission.visual_qa.failed") {
    return {
      id: "visual-qa-rerun-failed",
      kind: "visual_qa_rerun",
      source: "visual_qa",
      status: "failed",
      timestamp: ts,
      summary: `Visual QA rerun failed · ${stringValue(payload.summary) ?? "unknown"}`,
    };
  }
  if (type === "mission.fix_verification.observed") {
    return {
      id: "fix-verification-observed",
      kind: "fix_verification_observed",
      source: "fix_verification",
      status: "observed",
      timestamp: ts,
      summary: `Fix verification ${stringValue(payload.diffStatus) ?? "observed"} · resolved ${countLabel(payload.resolved)} · remaining ${countLabel(payload.remaining)} · new ${countLabel(payload.new)}`,
    };
  }
  if (type === "mission.fix_verification.failed") {
    return {
      id: "fix-verification-failed",
      kind: "fix_verification_failed",
      source: "fix_verification",
      status: "failed",
      timestamp: ts,
      summary: `Fix verification failed at ${stringValue(payload.step) ?? "unknown"} · ${stringValue(payload.summary) ?? "unknown"}`,
    };
  }
  return null;
}
