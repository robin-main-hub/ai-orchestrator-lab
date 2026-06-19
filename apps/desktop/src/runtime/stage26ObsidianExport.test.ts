import { describe, expect, it } from "vitest";
import type { BackupProjectionArtifact } from "@ai-orchestrator/protocol";
import { createObsidianExportPlan, writeObsidianExport } from "./stage26ObsidianExport";

const artifact: BackupProjectionArtifact = {
  id: "backup_artifact_obsidian_1",
  sessionId: "session_desktop_001",
  target: "obsidian",
  kind: "session_log",
  format: "markdown",
  title: "Obsidian Session Markdown",
  destination: "AI-Orchestrator/projects/lab/sessions/session_desktop_001.md",
  redactionApplied: true,
  status: "ready",
  byteLength: 42,
  createdAt: "2026-05-24T00:00:00.000Z",
  contentPreview: "# Session",
};

describe("stage26 Obsidian export", () => {
  it("creates a vault-local markdown export plan", () => {
    const plan = createObsidianExportPlan({
      vaultRoot: "/Users/robin/Obsidian/Vault/",
      artifact,
      content: "# Session",
    });

    expect(plan.absolutePath).toBe(
      "/Users/robin/Obsidian/Vault/AI-Orchestrator/projects/lab/sessions/session_desktop_001.md",
    );
    expect(plan.relativePath).toBe("AI-Orchestrator/projects/lab/sessions/session_desktop_001.md");
    expect(plan.redactionRequired).toBe(false);
  });

  it("blocks traversal outside the vault", () => {
    expect(() =>
      createObsidianExportPlan({
        vaultRoot: "/Users/robin/Obsidian/Vault",
        artifact: {
          ...artifact,
          destination: "../secrets.md",
        },
        content: "# Session",
      }),
    ).toThrow("inside the Obsidian vault");
  });

  it("writes via an injected file writer", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const plan = await writeObsidianExport(
      {
        vaultRoot: "/vault",
        artifact,
        content: "# Session",
      },
      async (path, content) => {
        writes.push({ path, content });
      },
    );

    expect(plan.absolutePath).toContain("/vault/");
    expect(writes[0]?.content).toBe("# Session");
  });
});

// Characterization tests for previously-uncovered stage26 Obsidian-export
// branches (no behavior change, no file I/O, no secret). These pin the
// authority-adjacent replica-projection seam: the non-obsidian target guard,
// the destination-already-inside-vault path (no double-join), vaultRoot
// backslash/empty normalization, the non-.md and empty-destination guards,
// the redactionRequired=true case, and UTF-8 byteLength counting.
describe("stage26 Obsidian export — plan edge characterization", () => {
  it("rejects a non-obsidian artifact target and names the actual target", () => {
    expect(() =>
      createObsidianExportPlan({
        vaultRoot: "/Users/robin/Obsidian/Vault",
        artifact: { ...artifact, target: "notion" } as BackupProjectionArtifact,
        content: "# Session",
      }),
    ).toThrow("artifact target must be obsidian, got notion");
  });

  it("keeps an absolute destination already inside the vault without double-joining", () => {
    const plan = createObsidianExportPlan({
      vaultRoot: "/Users/robin/Obsidian/Vault",
      artifact: {
        ...artifact,
        destination: "/Users/robin/Obsidian/Vault/AI-Orchestrator/notes/session.md",
      },
      content: "# Session",
    });

    expect(plan.absolutePath).toBe("/Users/robin/Obsidian/Vault/AI-Orchestrator/notes/session.md");
    expect(plan.relativePath).toBe("AI-Orchestrator/notes/session.md");
  });

  it("normalizes backslash separators and trailing slashes in the vault root", () => {
    const plan = createObsidianExportPlan({
      vaultRoot: "C:\\Users\\robin\\Vault\\",
      artifact: { ...artifact, destination: "notes/session.md" },
      content: "# Session",
    });

    expect(plan.vaultRoot).toBe("C:/Users/robin/Vault");
    expect(plan.absolutePath).toBe("C:/Users/robin/Vault/notes/session.md");
  });

  it("requires a non-empty vault root", () => {
    expect(() => createObsidianExportPlan({ vaultRoot: "/", artifact, content: "x" })).toThrow(
      "vaultRoot is required",
    );
  });

  it("requires a markdown destination file", () => {
    expect(() =>
      createObsidianExportPlan({
        vaultRoot: "/vault",
        artifact: { ...artifact, destination: "notes/session.txt" },
        content: "x",
      }),
    ).toThrow("must be a markdown file");
  });

  it("marks redactionRequired when the artifact has not been redacted", () => {
    const plan = createObsidianExportPlan({
      vaultRoot: "/vault",
      artifact: { ...artifact, redactionApplied: false },
      content: "# Session",
    });

    expect(plan.redactionRequired).toBe(true);
  });

  it("counts UTF-8 byte length, not character count, for multibyte content", () => {
    const content = "세션";
    const plan = createObsidianExportPlan({ vaultRoot: "/vault", artifact, content });

    expect(content.length).toBe(2);
    expect(plan.byteLength).toBe(6);
  });
});
