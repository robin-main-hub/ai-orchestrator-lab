import { describe, expect, it } from "vitest";
import {
  buildEditTimeline,
  editHistoryEventFromContext,
  type EditHistoryEvent,
} from "./editTimeline";

describe("buildEditTimeline", () => {
  it("orders edit-loop events and exposes only compact timeline fields", () => {
    const events: ReadonlyArray<EditHistoryEvent & {
      rawPrompt?: string;
      rawResponse?: string;
      rawFileContent?: string;
    }> = [
      {
        id: "verify",
        kind: "fix_verification_observed",
        source: "fix_verification",
        status: "observed",
        timestamp: "2026-06-15T00:00:04.000Z",
        affectedFiles: ["src/App.tsx"],
        summary: "verify passed",
      },
      {
        id: "annotation",
        kind: "preview_annotation_captured",
        source: "preview",
        status: "captured",
        timestamp: "2026-06-15T00:00:01.000Z",
        summary: "User clicked preview at 43% x, 62% y",
      },
      {
        id: "draft",
        kind: "provider_draft_generated",
        source: "turbo_edits",
        status: "generated",
        timestamp: "2026-06-15T00:00:02.000Z",
        affectedFiles: ["src/App.tsx"],
        summary: "provider draft generated",
        rawPrompt: "RAW_PROMPT_SHOULD_NOT_SURFACE",
        rawResponse: "RAW_PROVIDER_RESPONSE_SHOULD_NOT_SURFACE",
      },
      {
        id: "overlay",
        kind: "scaffold_overlay_applied",
        source: "scaffold_overlay",
        status: "applied",
        timestamp: "2026-06-15T00:00:03.000Z",
        affectedFiles: ["src/App.tsx", "src/App.tsx"],
        summary: "overlay recorded",
        restoreText: "src/App.tsx\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE",
        rawFileContent: "FULL_FILE_CONTENT_SHOULD_NOT_SURFACE",
      },
    ];

    const timeline = buildEditTimeline(events);

    expect(timeline.map((item) => item.kind)).toEqual([
      "preview_annotation_captured",
      "provider_draft_generated",
      "scaffold_overlay_applied",
      "fix_verification_observed",
    ]);
    expect(timeline[2]!.affectedFiles).toEqual(["src/App.tsx"]);
    expect(timeline[2]!.restoreText).toContain("<<<<<<< SEARCH");
    expect(JSON.stringify(timeline)).not.toContain("RAW_PROMPT_SHOULD_NOT_SURFACE");
    expect(JSON.stringify(timeline)).not.toContain("RAW_PROVIDER_RESPONSE_SHOULD_NOT_SURFACE");
    expect(JSON.stringify(timeline)).not.toContain("FULL_FILE_CONTENT_SHOULD_NOT_SURFACE");
  });

  it("maps existing compact trace events for provider, preview, QA, and verification statuses", () => {
    const invalid = editHistoryEventFromContext("mission.turbo_edits.generate_invalid", {
      reason: "no_blocks",
      ts: "2026-06-15T00:00:01.000Z",
    });
    const failed = editHistoryEventFromContext("mission.turbo_edits.generate_failed", {
      reason: "rate_limit",
      ts: "2026-06-15T00:00:02.000Z",
    });
    const noEdits = editHistoryEventFromContext("mission.turbo_edits.generate_no_edits", {
      ts: "2026-06-15T00:00:03.000Z",
    });
    const preview = editHistoryEventFromContext("mission.preview.run-scaffold.observed", {
      url: "http://127.0.0.1:5173/",
      ts: "2026-06-15T00:00:04.000Z",
    });
    const qa = editHistoryEventFromContext("mission.visual_qa.observed", {
      status: "failed",
      issueCount: 2,
      ts: "2026-06-15T00:00:05.000Z",
    });
    const verify = editHistoryEventFromContext("mission.fix_verification.observed", {
      diffStatus: "passed",
      resolved: 2,
      remaining: 0,
      new: 0,
      ts: "2026-06-15T00:00:06.000Z",
    });

    expect(invalid?.status).toBe("invalid");
    expect(failed?.status).toBe("failed");
    expect(noEdits?.status).toBe("no_confident_edits");
    expect(preview?.kind).toBe("preview_rerun");
    expect(qa?.kind).toBe("visual_qa_rerun");
    expect(verify?.kind).toBe("fix_verification_observed");
  });
});
