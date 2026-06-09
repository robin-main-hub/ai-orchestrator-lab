import { describe, expect, it } from "vitest";
import {
  createPersonaFileSourceFromMap,
  listPersonaNamesFromMap,
  normalizeGlobMap,
} from "./personaFileBundle";

describe("normalizeGlobMap", () => {
  it("rewrites absolute and relative glob keys to repo-relative agents/ paths", () => {
    const normalized = normalizeGlobMap({
      "/home/x/repo/agents/architect/SOUL.md": "soul",
      "../../../../agents/SAFETY.md": "safety",
      "C:/repo/agents/architect/AGENTS.md": "agents",
      "/repo/packages/other/file.md": "ignored",
    });
    expect(normalized).toEqual({
      "agents/architect/SOUL.md": "soul",
      "agents/SAFETY.md": "safety",
      "agents/architect/AGENTS.md": "agents",
    });
  });
});

describe("createPersonaFileSourceFromMap", () => {
  it("reads present files and returns null for missing ones", async () => {
    const source = createPersonaFileSourceFromMap({ "agents/architect/SOUL.md": "soul body" });
    expect(await source.readMarkdown("agents/architect/SOUL.md")).toBe("soul body");
    expect(await source.readMarkdown("agents/missing/SOUL.md")).toBeNull();
  });
});

describe("listPersonaNamesFromMap", () => {
  it("lists persona dirs with a SOUL.md, sorted, ignoring top-level files", () => {
    const names = listPersonaNamesFromMap({
      "agents/architect/SOUL.md": "",
      "agents/architect/AGENTS.md": "",
      "agents/builder/SOUL.md": "",
      "agents/SAFETY.md": "",
      "agents/README.md": "",
      "agents/reviewer/AGENTS.md": "", // no SOUL -> not listed
    });
    expect(names).toEqual(["architect", "builder"]);
  });
});
