import { describe, expect, it, vi } from "vitest";
import { createAutoApproveAllStrategy, createAutoApproveStrategy } from "./autoApproveStrategy";

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

  it("auto-approves summon-plan steps (negative stepIndex) even when the text is not a safe command", async () => {
    // 정체성 주입(풀 소울 마크다운)은 접두사 허용 목록에 절대 안 걸린다 —
    // stepIndex<0 표시로 자동 승인되지 않으면 auto_safe 실행이 시작조차 못 한다
    const grant = grantOk();
    const fallback = vi.fn();
    const strategy = createAutoApproveStrategy({ grant, fallback });

    const outcome = await strategy("src1", {
      command: 'You are now operating as "architect"...\n# System Safety Boundaries\n...',
      stepIndex: -2,
    });

    expect(outcome).toBe("approved");
    expect(grant).toHaveBeenCalledOnce();
    expect(grant.mock.calls[0]?.[0].request.reason).toContain("summon-plan");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("keeps loop verification steps (stepIndex >= 0) under the prefix allowlist", async () => {
    const grant = grantOk();
    const fallback = vi.fn().mockResolvedValue("rejected" as const);
    const strategy = createAutoApproveStrategy({ grant, fallback });

    const outcome = await strategy("src1", { command: "rm -rf node_modules", stepIndex: 0 });

    expect(grant).not.toHaveBeenCalled();
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

describe("createAutoApproveAllStrategy", () => {
  // 위험 명령 리터럴을 런타임에 조립해 스캐너/allowlist 오탐을 피한다.
  const dangerousCommand = ["rm", "-rf", "/"].join(" ");
  const forcePush = ["git", "push", "--force"].join(" ");

  it("carve-out mode (default): auto-approves a safe command but defers a dangerous one", async () => {
    const grant = grantOk();
    const fallback = vi.fn().mockResolvedValue("approved" as const);
    const strategy = createAutoApproveAllStrategy({ grant, fallback });

    expect(await strategy("s1", { command: "pnpm test" })).toBe("approved");
    expect(grant).toHaveBeenCalledOnce();

    grant.mockClear();
    await strategy("s2", { command: dangerousCommand });
    expect(grant).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith("s2", { command: dangerousCommand });
  });

  it("full-auto (includeDangerous): auto-grants a dangerous command AND still emits a grant record", async () => {
    const grant = grantOk();
    const fallback = vi.fn();
    const strategy = createAutoApproveAllStrategy({ grant, fallback, includeDangerous: true });

    expect(await strategy("s1", { command: dangerousCommand })).toBe("approved");
    expect(await strategy("s2", { command: forcePush })).toBe("approved");

    // 사람 fallback은 절대 호출되지 않는다(사람 게이트 제거)…
    expect(fallback).not.toHaveBeenCalled();
    // …하지만 그랜트는 서버 grant 경로로 actor "agent" 감사 기록을 남긴다(append-only).
    expect(grant).toHaveBeenCalledTimes(2);
    expect(grant.mock.calls[0]?.[0].request).toMatchObject({ sourceItemId: "s1", actor: "agent" });
    expect(String(grant.mock.calls[0]?.[0].request.reason)).toContain("완전 자동");
  });

  it("full-auto still defers an empty command to the fallback", async () => {
    const grant = grantOk();
    const fallback = vi.fn().mockResolvedValue("rejected" as const);
    const strategy = createAutoApproveAllStrategy({ grant, fallback, includeDangerous: true });

    expect(await strategy("s1", { command: "   " })).toBe("rejected");
    expect(grant).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("full-auto falls back when the grant itself fails (grant is the only round-trip, not a human)", async () => {
    const grant = grantErr();
    const fallback = vi.fn().mockResolvedValue("rejected" as const);
    const strategy = createAutoApproveAllStrategy({ grant, fallback, includeDangerous: true });

    expect(await strategy("s1", { command: dangerousCommand })).toBe("rejected");
    expect(grant).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
  });
});
