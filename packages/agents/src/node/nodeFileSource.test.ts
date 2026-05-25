import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createNodeFileSource } from "./nodeFileSource";

describe("createNodeFileSource", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), "agents-persona-test-"));
    await mkdir(path.join(repoRoot, "agents", "architect"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "agents", "architect", "SOUL.md"),
      "# Architect Soul\n\nfixture body\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("reads an existing markdown file as utf8", async () => {
    const source = createNodeFileSource(repoRoot);
    const content = await source.readMarkdown("agents/architect/SOUL.md");
    expect(content).toContain("# Architect Soul");
    expect(content).toContain("fixture body");
  });

  it("returns null (NOT throws) for a missing file so the loader can wrap it", async () => {
    const source = createNodeFileSource(repoRoot);
    const content = await source.readMarkdown("agents/ghost/SOUL.md");
    expect(content).toBeNull();
  });

  it("returns null for a missing directory too (same ENOENT path)", async () => {
    const source = createNodeFileSource(repoRoot);
    const content = await source.readMarkdown("agents/missing-dir/something/SOUL.md");
    expect(content).toBeNull();
  });

  it("propagates non-ENOENT errors (e.g. EISDIR when path points at a directory)", async () => {
    const source = createNodeFileSource(repoRoot);
    // path resolves to a directory, not a file — readFile throws EISDIR on POSIX,
    // and Node on Windows throws an error with a different code but it is NOT
    // ENOENT, so the source should still propagate it instead of swallowing.
    await expect(source.readMarkdown("agents/architect")).rejects.toBeDefined();
  });

  it("findFirstExisting returns the first candidate that exists on disk", async () => {
    const source = createNodeFileSource(repoRoot);
    await writeFile(
      path.join(repoRoot, "agents", "architect", "avatar.svg"),
      "<svg/>",
      "utf8",
    );
    const found = await source.findFirstExisting!([
      "agents/architect/avatar.png", // missing
      "agents/architect/avatar.svg", // exists
      "agents/architect/avatar.jpg", // missing
    ]);
    expect(found).toBe("agents/architect/avatar.svg");
  });

  it("findFirstExisting returns null when no candidate exists on disk", async () => {
    const source = createNodeFileSource(repoRoot);
    const found = await source.findFirstExisting!([
      "agents/ghost/avatar.svg",
      "agents/ghost/avatar.png",
    ]);
    expect(found).toBeNull();
  });
});
