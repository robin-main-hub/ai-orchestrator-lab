import { describe, expect, it, vi } from "vitest";
import { applyScaffold, planScaffold } from "./scaffoldRunner";

const now = () => "2026-06-13T00:00:00.000Z";
const ALLOWED = ["/repo"];

const planBase = {
  id: "sc1",
  missionId: "m1",
  workspaceId: "ws1",
  templateId: "react_vite_app",
  templateInput: { appName: "demo" },
  repoRoot: "/repo",
  allowedRepoRoots: ALLOWED,
  now,
};

describe("planScaffold", () => {
  it("computes create vs overwrite from existing files (no write, planned)", async () => {
    const fileExists = vi.fn(async (p: string) => p.endsWith("package.json")); // package.json만 존재
    const result = await planScaffold({ ...planBase, fileExists });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.truthStatus).toBe("planned");
    expect(result.plan.hasOverwrites).toBe(true);
    expect(result.plan.files.find((f) => f.path === "package.json")?.action).toBe("overwrite");
    expect(result.plan.files.find((f) => f.path === "src/App.tsx")?.action).toBe("create");
  });

  it("blocks a repoRoot outside the allowlist", async () => {
    const result = await planScaffold({ ...planBase, repoRoot: "/nope", fileExists: async () => false });
    expect(result.ok).toBe(false);
  });
});

describe("applyScaffold", () => {
  async function plannedPlan(existing: (p: string) => boolean) {
    const r = await planScaffold({ ...planBase, fileExists: async (p) => existing(p) });
    if (!r.ok) throw new Error("plan failed");
    return r.plan;
  }

  it("writes new files (observed) after a checkpoint when there are no overwrites", async () => {
    const plan = await plannedPlan(() => false); // 전부 신규
    const written: string[] = [];
    const result = await applyScaffold({
      plan,
      allowedRepoRoots: ALLOWED,
      approvedOverwrite: false, // overwrite 없으니 필요 없음
      writeFile: async (abs) => {
        written.push(abs);
      },
      mkdir: async () => {},
      checkpoint: async () => "abc1234def",
      now,
    });
    expect(result.status).toBe("applied");
    expect(result.observed).toBe(true);
    expect(result.checkpointSha).toBe("abc1234def");
    expect(written.length).toBe(plan.files.length);
  });

  it("BLOCKS overwrite without an approval (no auto-overwrite, no write)", async () => {
    const plan = await plannedPlan((p) => p.endsWith("package.json")); // overwrite 발생
    const writeFile = vi.fn(async () => {});
    const result = await applyScaffold({ plan, allowedRepoRoots: ALLOWED, approvedOverwrite: false, writeFile, mkdir: async () => {}, checkpoint: async () => undefined, now });
    expect(result.status).toBe("blocked");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("applies overwrite when approved", async () => {
    const plan = await plannedPlan((p) => p.endsWith("package.json"));
    const writeFile = vi.fn(async () => {});
    const result = await applyScaffold({ plan, allowedRepoRoots: ALLOWED, approvedOverwrite: true, writeFile, mkdir: async () => {}, checkpoint: async () => "cp", now });
    expect(result.status).toBe("applied");
    expect(writeFile).toHaveBeenCalled();
  });

  it("blocks a repoRoot outside the allowlist", async () => {
    const plan = await plannedPlan(() => false);
    const result = await applyScaffold({ plan: { ...plan, repoRootRef: "/nope" }, allowedRepoRoots: ALLOWED, approvedOverwrite: true, writeFile: async () => {}, mkdir: async () => {}, checkpoint: async () => undefined, now });
    expect(result.status).toBe("blocked");
  });
});
