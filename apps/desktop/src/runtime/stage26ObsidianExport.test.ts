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
