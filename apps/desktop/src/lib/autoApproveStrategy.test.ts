import { describe, expect, it, vi } from "vitest";
import { createAutoApproveStrategy } from "./autoApproveStrategy";

const grantOk = () => vi.fn().mockResolvedValue({ status: "approved", approval: {}, event: {} } as any);
const grantErr = () => vi.fn().mockResolvedValue({ error: "approval_not_found" } as any);

describe("createAutoApproveStrategy", () => {
  it("auto-approves a safe command via grant, without calling the fallback", async () => {
    const grant = grantOk();
    const fallback = vi.fn();
    const strategy = createAutoApproveStrategy({ grant, fallback });

    const outcome = await strategy("src1", { command: "pnpm test" });

    expect(outcome).toBe("approved");
    expect(grant).toHaveBeenCalledOnce();
    expect(grant.mock.calls[0]?.[0].request).toMatchObject({ sourceItemId: "src1", actor: "agent" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("defers an unsafe command to the fallback and never grants", async () => {
    const grant = grantOk();
    const fallback = vi.fn().mockResolvedValue("approved" as const);
    const strategy = createAutoApproveStrategy({ grant, fallback });

    const outcome = await strategy("src1", { command: "rm -rf node_modules" });

    expect(grant).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith("src1", { command: "rm -rf node_modules" });
    expect(outcome).toBe("approved");
  });

  it("falls back to a human when the grant fails", async () => {
    const grant = grantErr();
    const fallback = vi.fn().mockResolvedValue("rejected" as const);
    const strategy = createAutoApproveStrategy({ grant, fallback });

    const outcome = await strategy("src1", { command: "pnpm test" });

    expect(grant).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
    expect(outcome).toBe("rejected");
  });

  it("honors a custom allowlist", async () => {
    const grant = grantOk();
    const fallback = vi.fn().mockResolvedValue("rejected" as const);
    const strategy = createAutoApproveStrategy({ grant, fallback, safePrefixes: ["make verify"] });

    await strategy("s", { command: "make verify" });
    expect(grant).toHaveBeenCalledOnce();

    await strategy("s", { command: "pnpm test" }); // not in custom allowlist
    expect(fallback).toHaveBeenCalledOnce();
  });
});
