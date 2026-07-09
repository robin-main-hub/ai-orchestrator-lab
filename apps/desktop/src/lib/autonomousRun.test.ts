import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { CodingPacket } from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import { createApprovalStrategy, runAutonomousPersonaTask } from "./autonomousRun";
import { createSummonRegistry, type SummonContext } from "./personaSummon";

const ctx: SummonContext = {
  now: "2026-06-10T00:00:00.000Z",
  makeSessionId: (persona, paneId) => `as_${persona}_${paneId}`,
};

const persona = (): LoadedPersona => ({
  personaName: "makise",
  mode: "soul_plus_agents",
  safetyContent: "Never touch DGX-01.",
  fragments: [{ source: "soul", relativePath: "agents/makise/SOUL.md", content: "Precise." }],
});

const packet = (verificationPlan: string[]): CodingPacket => ({
  goal: "Implement the widget",
  context: [],
  decisions: [],
  rejectedOptions: [],
  constraints: [],
  filesToInspect: [],
  implementationPlan: [],
  verificationPlan,
  reviewerNotes: [],
});

const dispatchResponse = (status: string) =>
  ({
    intent: {},
    permission: { decision: status === "dry_run" ? "allow" : "approval_required", requestedLevels: [], reason: "" },
    approval: { sourceItemId: "ignored" },
    dispatch: { attempted: false, status, reason: status },
  }) as any;

describe("createApprovalStrategy", () => {
  it("mode 'human' resolves via the approval queue poll", async () => {
    const fetchQueue = vi.fn().mockResolvedValue({ approvals: [{ sourceItemId: "s1", state: "approved" }], queue: [] } as any);
    const strategy = createApprovalStrategy("human", { clients: { fetchQueue } });
    expect(await strategy("s1", { command: "pnpm test" })).toBe("approved");
    expect(fetchQueue).toHaveBeenCalled();
  });

  it("mode 'auto_safe' auto-grants a safe command without polling", async () => {
    const grant = vi.fn().mockResolvedValue({ status: "approved", approval: {}, event: {} } as any);
    const fetchQueue = vi.fn();
    const strategy = createApprovalStrategy("auto_safe", { clients: { grant, fetchQueue } });
    expect(await strategy("s1", { command: "pnpm test" })).toBe("approved");
    expect(grant).toHaveBeenCalledOnce();
    expect(fetchQueue).not.toHaveBeenCalled();
  });

  it("mode 'auto_safe' defers an unsafe command to the human poll", async () => {
    const grant = vi.fn();
    const fetchQueue = vi.fn().mockResolvedValue({ approvals: [{ sourceItemId: "s2", state: "rejected" }], queue: [] } as any);
    const strategy = createApprovalStrategy("auto_safe", { clients: { grant, fetchQueue } });
    // 위험 명령 리터럴은 런타임에 조립(스캐너 오탐 회피).
    expect(await strategy("s2", { command: ["rm", "-rf", "/"].join(" ") })).toBe("rejected");
    expect(grant).not.toHaveBeenCalled();
    expect(fetchQueue).toHaveBeenCalled();
  });

  it("mode 'full_auto' auto-grants a DANGEROUS command without polling, and still records the grant", async () => {
    const grant = vi.fn().mockResolvedValue({ status: "approved", approval: {}, event: {} } as any);
    const fetchQueue = vi.fn();
    const strategy = createApprovalStrategy("full_auto", { clients: { grant, fetchQueue } });

    // 위험 명령(카브아웃 없음)도 자동 승인 — 사람 poll(fetchQueue)은 절대 호출되지 않는다.
    expect(await strategy("s1", { command: ["rm", "-rf", "node_modules"].join(" ") })).toBe("approved");
    expect(await strategy("s2", { command: ["git", "push", "--force"].join(" ") })).toBe("approved");

    expect(fetchQueue).not.toHaveBeenCalled();
    // 감사 기록은 그대로 — 서버 grant 를 actor "agent"로 round-trip 한다(사람만 제거).
    expect(grant).toHaveBeenCalledTimes(2);
    expect(grant.mock.calls[0]?.[0].request).toMatchObject({ actor: "agent" });
  });
});

describe("runAutonomousPersonaTask", () => {
  it("summons, injects, and drives the verification plan to completion end-to-end", async () => {
    const dispatched: string[] = [];
    const dispatchClient = vi.fn(async ({ request }: any) => {
      dispatched.push(request.commandPreview);
      return dispatchResponse("dry_run"); // gate already executed -> no approval dance needed
    });
    let cap = 0;
    const captures = ["All tests passed"];
    const captureClient = vi.fn(async () => ({
      status: "captured",
      reason: "ok",
      payload: { outputPreview: captures[Math.min(cap++, captures.length - 1)], lineCount: 1 },
    }) as any);

    const result = await runAutonomousPersonaTask({
      registry: createSummonRegistry([{ paneId: "%1", role: "qa" }]),
      summon: { personaName: "makise", sessionId: "s1", preferredRole: "qa" },
      persona: persona(),
      packet: packet(["run tests"]),
      ctx,
      mode: "human",
      clients: { dispatchClient, captureClient },
      now: () => "2026-06-10T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loopStatus).toBe("completed");
    expect(result.registry.panes.find((p) => p.paneId === "%1")?.status).toBe("free");
    // identity injection + kickoff (packet goal) + verification step
    expect(dispatched[0]).toContain("Precise.");
    expect(dispatched[1]).toBe("Implement the widget");
    expect(dispatched[2]).toBe("run tests");
  });

  it("returns no_free_pane when the roster is exhausted", async () => {
    const result = await runAutonomousPersonaTask({
      registry: createSummonRegistry([]), // no panes
      summon: { personaName: "makise", sessionId: "s1" },
      persona: persona(),
      packet: packet(["run tests"]),
      ctx,
      mode: "auto_safe",
    });
    expect(result).toEqual({ ok: false, reason: "no_free_pane" });
  });
});
