import { describe, expect, it } from "vitest";
import type { CodingPacket, DebateRound } from "@ai-orchestrator/protocol";
import {
  advanceDebateRound,
  assertSafeCodingPacket,
  blockDebateRound,
  createDebateRounds,
  getActiveDebateRound,
  validateCodingPacketSafety,
} from "./index";

const NULL_CHAR = String.fromCharCode(0);

function basePacket(overrides: Partial<CodingPacket> = {}): CodingPacket {
  return {
    goal: "goal",
    context: ["ctx"],
    decisions: ["d1"],
    rejectedOptions: ["r1"],
    constraints: ["c1"],
    filesToInspect: ["packages/agents/src/index.ts"],
    implementationPlan: ["step 1"],
    verificationPlan: ["pnpm test"],
    reviewerNotes: ["note 1"],
    ...overrides,
  };
}

describe("debate round lifecycle", () => {
  it("seeds the first round as running and the rest as pending", () => {
    const rounds = createDebateRounds("debate_a");
    expect(rounds).toHaveLength(7);
    expect(rounds[0]!.status).toBe("running");
    expect(rounds.slice(1).every((round) => round.status === "pending")).toBe(true);
  });

  it("getActiveDebateRound returns the currently running round", () => {
    const rounds = createDebateRounds("debate_b");
    expect(getActiveDebateRound(rounds)?.id).toBe(rounds[0]!.id);
  });

  it("returns undefined when no round is running", () => {
    const rounds = createDebateRounds("debate_c").map((round) => ({ ...round, status: "pending" as const }));
    expect(getActiveDebateRound(rounds)).toBeUndefined();
  });

  it("advances from a running round to the next pending round", () => {
    const rounds = createDebateRounds("debate_d");
    const result = advanceDebateRound(rounds, rounds[0]!.id);
    expect(result.finished).toBe(false);
    expect(result.nextRunningRoundId).toBe(rounds[1]!.id);
    expect(result.rounds[0]!.status).toBe("completed");
    expect(result.rounds[1]!.status).toBe("running");
  });

  it("marks finished when the last round completes", () => {
    let rounds = createDebateRounds("debate_e");
    for (const round of rounds) {
      const result = advanceDebateRound(rounds, round.id);
      rounds = result.rounds;
      if (round === rounds[rounds.length - 1]) {
        expect(result.finished).toBe(true);
        expect(result.nextRunningRoundId).toBeUndefined();
      }
    }
    expect(rounds.every((round) => round.status === "completed")).toBe(true);
  });

  it("throws when advancing an unknown round id", () => {
    const rounds = createDebateRounds("debate_f");
    expect(() => advanceDebateRound(rounds, "missing")).toThrow(/not found/);
  });

  it("throws when re-advancing a completed round", () => {
    const rounds = createDebateRounds("debate_g");
    const first = advanceDebateRound(rounds, rounds[0]!.id);
    expect(() => advanceDebateRound(first.rounds, rounds[0]!.id)).toThrow(/already completed/);
  });

  it("throws when advancing a blocked round", () => {
    const rounds = createDebateRounds("debate_h");
    const blocked = blockDebateRound(rounds, rounds[0]!.id);
    expect(() => advanceDebateRound(blocked, rounds[0]!.id)).toThrow(/blocked/);
  });

  it("blockDebateRound marks the round blocked", () => {
    const rounds = createDebateRounds("debate_i");
    const blocked = blockDebateRound(rounds, rounds[2]!.id);
    expect(blocked[2]!.status).toBe("blocked");
  });

  it("blockDebateRound refuses an already completed round", () => {
    const rounds = createDebateRounds("debate_j");
    const advanced = advanceDebateRound(rounds, rounds[0]!.id).rounds;
    expect(() => blockDebateRound(advanced, rounds[0]!.id)).toThrow(/completed/);
  });

  it("blockDebateRound refuses an unknown round id", () => {
    const rounds = createDebateRounds("debate_k");
    expect(() => blockDebateRound(rounds, "missing")).toThrow(/not found/);
  });

  it("skips already completed rounds when picking the next pending", () => {
    const rounds: DebateRound[] = createDebateRounds("debate_l").map((round, index) => {
      if (index === 0) return { ...round, status: "running" as const };
      if (index === 1) return { ...round, status: "completed" as const };
      return round;
    });
    const result = advanceDebateRound(rounds, rounds[0]!.id);
    expect(result.nextRunningRoundId).toBe(rounds[2]!.id);
  });
});

describe("validateCodingPacketSafety", () => {
  it("accepts a normal packet", () => {
    const result = validateCodingPacketSafety(basePacket());
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects parent-directory traversal in filesToInspect", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: ["../../etc/passwd"] }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.filesToInspect).toEqual([]);
    expect(result.violations.join(" ")).toMatch(/traversal/);
  });

  it("rejects unix absolute paths", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: ["/etc/passwd"] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/absolute/);
  });

  it("rejects windows absolute paths", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: ["C:\\Windows\\System32\\config"] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/absolute/);
  });

  it("rejects paths containing null bytes", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: [`packages/agents/src/index.ts${NULL_CHAR}.bak`] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/null byte/);
  });

  it("rejects empty file entries", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: [""] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/empty/);
  });

  it("rejects overlong plan entries", () => {
    const result = validateCodingPacketSafety(
      basePacket({ implementationPlan: ["x".repeat(4001)] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/exceeds 4000/);
  });

  it("truncates lists longer than 100 and records a violation", () => {
    const longList = Array.from({ length: 150 }, (_, index) => `file-${index}.ts`);
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: longList }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.filesToInspect).toHaveLength(100);
    expect(result.violations.join(" ")).toMatch(/exceeds 100/);
  });

  it("keeps safe siblings when one entry is unsafe", () => {
    const result = validateCodingPacketSafety(
      basePacket({
        filesToInspect: ["packages/protocol/src/index.ts", "../../escape"],
      }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.filesToInspect).toEqual(["packages/protocol/src/index.ts"]);
  });
});

describe("assertSafeCodingPacket", () => {
  it("returns the sanitized packet when safe", () => {
    const sanitized = assertSafeCodingPacket(basePacket());
    expect(sanitized.goal).toBe("goal");
  });

  it("throws when unsafe", () => {
    expect(() =>
      assertSafeCodingPacket(basePacket({ filesToInspect: ["/etc/passwd"] })),
    ).toThrow(/unsafe coding packet/);
  });
});
