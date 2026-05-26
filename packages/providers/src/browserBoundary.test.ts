import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Static guard: the root barrel `packages/providers/src/index.ts` must never
 * pull in Node-only imports (`node:*`, `child_process`, `fs`, `os`, `path`)
 * because the desktop electron renderer ships it as a browser bundle.
 *
 * CLI / subprocess adapters live under `packages/providers/src/node/` and are
 * re-exported via the `@ai-orchestrator/providers/node` subpath only.
 *
 * Regression catcher for the bug fixed in PR #172 (top-level
 * `import { randomUUID } from "node:crypto"` broke desktop boot).
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /from\s+["']node:[a-z_/-]+["']/,
  /from\s+["']child_process["']/,
  /from\s+["']fs(?:\/promises)?["']/,
  /from\s+["']os["']/,
  /from\s+["']path["']/,
  /require\(\s*["']node:[a-z_/-]+["']\s*\)/,
  /require\(\s*["']child_process["']\s*\)/,
];

describe("providers browser-boundary guard", () => {
  it("root index.ts has no Node-only imports", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const indexPath = join(here, "index.ts");
    const source = await readFile(indexPath, "utf8");

    const violations: string[] = [];
    for (const pattern of FORBIDDEN_PATTERNS) {
      const match = pattern.exec(source);
      if (match) {
        violations.push(`${pattern} → ${match[0]}`);
      }
    }

    expect(violations, `index.ts must not pull node-only imports into the browser bundle. Move them under ./node and export via the /node subpath. Found: ${violations.join(", ")}`).toEqual([]);
  });

  it("non-node adapter source files have no Node-only imports", async () => {
    // Spot-check the named browser-safe adapters too — these are
    // re-exported from root and ship into desktop.
    const here = dirname(fileURLToPath(import.meta.url));
    const browserSafeFiles = [
      "anthropicAdapter.ts",
      "openAiCompatibleAdapter.ts",
      "ollamaAdapter.ts",
      "mockLlmAdapter.ts",
      "connectionHealth.ts",
      "adapter.ts",
      "errors.ts",
    ];

    for (const file of browserSafeFiles) {
      const source = await readFile(join(here, file), "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = pattern.exec(source);
        expect(
          match,
          `${file} must stay browser-safe. Move CLI/subprocess code under ./node. Found: ${match?.[0] ?? ""}`,
        ).toBeNull();
      }
    }
  });
});
