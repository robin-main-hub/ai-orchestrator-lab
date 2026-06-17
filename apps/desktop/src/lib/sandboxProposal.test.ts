import { describe, expect, it } from "vitest";
import { EXAMPLE_SANDBOX_PROPOSALS, isProposalOnly, type SandboxProposal } from "./sandboxProposal";

const FORBIDDEN = ["example-domain", " gio ", "erp", "customer", "sales", "quotation", "buyer", "factory"];

describe("Batch 22 — sandbox proposal fixtures (proposal-only, generic)", () => {
  it("every example proposal is dry-run, simulated, and proposal-only", () => {
    expect(EXAMPLE_SANDBOX_PROPOSALS.length).toBeGreaterThan(0);
    for (const p of EXAMPLE_SANDBOX_PROPOSALS) {
      expect(p.dryRun).toBe(true);
      expect(isProposalOnly(p)).toBe(true);
      expect(p.outcome.startsWith("simulated-")).toBe(true);
      expect(p.note).toContain("not executed");
    }
  });

  it("isProposalOnly rejects a non-dry-run or non-simulated shape", () => {
    const bad = { ...EXAMPLE_SANDBOX_PROPOSALS[0]!, dryRun: false as unknown as true };
    expect(isProposalOnly(bad as SandboxProposal)).toBe(false);
  });

  it("fixtures carry no domain/company vocabulary", () => {
    const blob = JSON.stringify(EXAMPLE_SANDBOX_PROPOSALS).toLowerCase();
    for (const term of FORBIDDEN) expect(blob.includes(term)).toBe(false);
  });
});
