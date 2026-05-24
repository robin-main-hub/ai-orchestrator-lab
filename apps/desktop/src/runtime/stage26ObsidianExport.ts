import type { BackupProjectionArtifact } from "@ai-orchestrator/protocol";

export type Stage26ObsidianExportPlan = {
  target: "obsidian";
  vaultRoot: string;
  relativePath: string;
  absolutePath: string;
  byteLength: number;
  redactionRequired: boolean;
};

export type Stage26ObsidianExportInput = {
  vaultRoot: string;
  artifact: BackupProjectionArtifact;
  content: string;
};

export type Stage26FileWriter = (absolutePath: string, content: string) => Promise<void>;

export async function writeObsidianExport(
  input: Stage26ObsidianExportInput,
  writeFile: Stage26FileWriter,
): Promise<Stage26ObsidianExportPlan> {
  const plan = createObsidianExportPlan(input);
  await writeFile(plan.absolutePath, input.content);
  return plan;
}

export function createObsidianExportPlan({
  vaultRoot,
  artifact,
  content,
}: Stage26ObsidianExportInput): Stage26ObsidianExportPlan {
  if (artifact.target !== "obsidian") {
    throw new Error(`artifact target must be obsidian, got ${artifact.target}`);
  }

  const safeVaultRoot = normalizePath(vaultRoot);
  const relativePath = normalizeRelativePath(artifact.destination);
  const absolutePath = joinVaultPath(safeVaultRoot, relativePath);

  return {
    target: "obsidian",
    vaultRoot: safeVaultRoot,
    relativePath,
    absolutePath,
    byteLength: new TextEncoder().encode(content).length,
    redactionRequired: !artifact.redactionApplied,
  };
}

function normalizePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("vaultRoot is required");
  }

  return normalized;
}

function normalizeRelativePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("artifact destination is required");
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("artifact destination must stay inside the Obsidian vault");
  }

  if (!segments[segments.length - 1]?.endsWith(".md")) {
    throw new Error("Obsidian export destination must be a markdown file");
  }

  return segments.join("/");
}

function joinVaultPath(vaultRoot: string, relativePath: string) {
  return `${vaultRoot}/${relativePath}`;
}
