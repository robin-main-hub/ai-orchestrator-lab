import type { CodingPacket } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { codingPacketToAutonomyForm } from "./codingPacketToAutonomyForm";

const packet = (overrides: Partial<CodingPacket> = {}): CodingPacket => ({
  goal: "Add a rate limiter to the ingress guard",
  context: [],
  decisions: [],
  rejectedOptions: [],
  constraints: [],
  filesToInspect: [],
  implementationPlan: [],
  verificationPlan: ["pnpm test", "pnpm typecheck"],
  reviewerNotes: [],
  ...overrides,
});

describe("codingPacketToAutonomyForm", () => {
  it("maps goal and verification plan into the form", () => {
    const form = codingPacketToAutonomyForm(packet());
    expect(form.goal).toBe("Add a rate limiter to the ingress guard");
    expect(form.verificationStepsText).toBe("pnpm test\npnpm typecheck");
    expect(form.role).toBe("code"); // coding packets default to the code pane
    expect(form.mode).toBe("full_auto"); // 기본 자율성 모드 = 완전 자동(사람 승인 게이트 없음)
    expect(form.personaName).toBe("");
  });

  it("honors persona / role / mode overrides", () => {
    const form = codingPacketToAutonomyForm(packet(), { personaName: "builder", role: "backend", mode: "auto_safe" });
    expect(form.personaName).toBe("builder");
    expect(form.role).toBe("backend");
    expect(form.mode).toBe("auto_safe");
  });

  it("handles an empty verification plan", () => {
    expect(codingPacketToAutonomyForm(packet({ verificationPlan: [] })).verificationStepsText).toBe("");
  });
});
