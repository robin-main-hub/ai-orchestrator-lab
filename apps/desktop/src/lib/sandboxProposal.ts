/**
 * Batch 22 LINE F — Sandbox Proposal Shell (read-only, proposal-only).
 *
 * The SANDBOX seat is a "what-if" surface: it shows generic scenario PROPOSALS with
 * a simulated outcome label and a dry-run state. It NEVER executes, dispatches,
 * writes, syncs, or runs anything — a proposal is an inert preview object. Static
 * generic fixtures only (no domain terms, no remote loading). Pure.
 */

export type SandboxOutcome = "simulated-pass" | "simulated-warning" | "simulated-blocked";

export type SandboxProposal = {
  id: string;
  title: string;
  /** what-if description (generic). */
  scenario: string;
  /** always true — a proposal is dry-run only, never executed. */
  dryRun: true;
  /** simulated outcome label (not a real result). */
  outcome: SandboxOutcome;
  /** proposed steps, read-only preview. */
  steps: ReadonlyArray<string>;
  note: string;
};

const PROPOSAL_NOTE = "proposal only · not executed";

export const EXAMPLE_SANDBOX_PROPOSALS: ReadonlyArray<SandboxProposal> = [
  {
    id: "sbx-001",
    title: "external source refresh (what-if)",
    scenario: "example-source 가 새 항목을 내놓으면 Source Dock 이 어떻게 보일지 미리보기",
    dryRun: true,
    outcome: "simulated-pass",
    steps: ["read example-source manifest", "project work-item-lite rows", "render in source dock"],
    note: PROPOSAL_NOTE,
  },
  {
    id: "sbx-002",
    title: "patch candidate review (what-if)",
    scenario: "runner-001 가 patch 후보를 냈다고 가정했을 때 lane/safety가 어떻게 보일지",
    dryRun: true,
    outcome: "simulated-warning",
    steps: ["map handoff → candidate", "show safety status", "show claimed vs actual delta"],
    note: PROPOSAL_NOTE,
  },
  {
    id: "sbx-003",
    title: "memory consolidation (what-if)",
    scenario: "evidence 후보가 memory로 합쳐진다면 어떤 후보가 suggested로 보일지",
    dryRun: true,
    outcome: "simulated-blocked",
    steps: ["gather evidence candidates", "simulate suggested set", "no write — preview only"],
    note: PROPOSAL_NOTE,
  },
];

/** True only when a proposal is a safe, inert, dry-run preview (never executable). */
export function isProposalOnly(p: SandboxProposal): boolean {
  return (
    p.dryRun === true &&
    (["simulated-pass", "simulated-warning", "simulated-blocked"] as const).includes(p.outcome) &&
    p.note.includes("proposal only")
  );
}
