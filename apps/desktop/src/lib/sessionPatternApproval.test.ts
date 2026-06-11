import { describe, expect, it } from "vitest";
import {
  createPatternApprovalStrategy,
  extractCommandPrefix,
  matchesApprovedPrefix,
} from "./sessionPatternApproval";

describe("extractCommandPrefix", () => {
  it("uses two tokens for known runners", () => {
    expect(extractCommandPrefix("git status --short")).toBe("git status");
    expect(extractCommandPrefix("pnpm test -- --watch")).toBe("pnpm test");
    expect(extractCommandPrefix("tsc --noEmit")).toBe("tsc");
  });

  it("uses one token otherwise", () => {
    expect(extractCommandPrefix("ls -la")).toBe("ls");
    expect(extractCommandPrefix("  cat file.txt ")).toBe("cat");
    expect(extractCommandPrefix("")).toBe("");
  });
});

describe("matchesApprovedPrefix", () => {
  it("matches exact and prefix+space forms only", () => {
    expect(matchesApprovedPrefix("git status", ["git status"])).toBe(true);
    expect(matchesApprovedPrefix("git status --short", ["git status"])).toBe(true);
    expect(matchesApprovedPrefix("git statusx", ["git status"])).toBe(false);
    expect(matchesApprovedPrefix("git log", ["git status"])).toBe(false);
  });

  it("never matches dangerous commands even with an approved prefix", () => {
    expect(matchesApprovedPrefix("git push --force origin main", ["git push"])).toBe(false);
    expect(matchesApprovedPrefix("ls; rm -rf /", ["ls"])).toBe(false);
  });
});

describe("createPatternApprovalStrategy", () => {
  it("grants matching commands without consulting the base strategy", async () => {
    const granted: string[] = [];
    const strategy = createPatternApprovalStrategy({
      base: async () => {
        throw new Error("base must not be called");
      },
      getApprovedPrefixes: () => ["git status"],
      grant: async (_id, context) => {
        granted.push(context.prefix);
        return true;
      },
    });
    await expect(strategy("item_1", { command: "git status --short" })).resolves.toBe("approved");
    expect(granted).toEqual(["git status"]);
  });

  it("falls through to the base strategy when no prefix matches", async () => {
    const strategy = createPatternApprovalStrategy({
      base: async () => "rejected",
      getApprovedPrefixes: () => ["git status"],
      grant: async () => {
        throw new Error("grant must not be called");
      },
    });
    await expect(strategy("item_2", { command: "make build" })).resolves.toBe("rejected");
  });

  it("falls back to base when the server grant fails", async () => {
    let baseCalled = false;
    const strategy = createPatternApprovalStrategy({
      base: async () => {
        baseCalled = true;
        return "approved";
      },
      getApprovedPrefixes: () => ["ls"],
      grant: async () => false,
    });
    await expect(strategy("item_3", { command: "ls -la" })).resolves.toBe("approved");
    expect(baseCalled).toBe(true);
  });
});
