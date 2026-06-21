import { describe, expect, it } from "vitest";
import { branchExperimentSchema, codingPacketSchema, conversationMessageSchema } from "@ai-orchestrator/protocol";
import { codingPacket, initialBranchExperiments, initialConversationMessages } from "./conversation";

// The conversation cluster seeds the desktop OS boots into: the opening transcript
// (initialConversationMessages), the speculative forks offered from it
// (initialBranchExperiments), and the coding-packet draft it can hand off
// (codingPacket). The sibling conversationEventLog.test.ts pins the *projection
// contract* of the derived event log (count / order / id-linkage / envelope
// stamping) but never runtime-validates any of these RECORDS against their Zod
// schemas — it reads message.role/id by hand and asserts shape manually — and it
// never touches initialBranchExperiments or codingPacket at all. The FRESH authority
// angle here is CONVERSATION-CLUSTER SCHEMA CONFORMANCE: every seeded record the OS
// renders is a valid protocol instance, with the refinements the inferred TypeScript
// type cannot express (role enum closure, the branch-status vocabulary, min/max
// bounds, the createdAt string) enforced at parse time. (1) EVERY SEEDED MESSAGE
// PARSES — each initialConversationMessages entry round-trips through
// conversationMessageSchema (a runtime check strictly stronger than the type the
// projection test relies on). (2) EVERY SEEDED FORK PARSES — each
// initialBranchExperiments entry round-trips through branchExperimentSchema, an
// entirely unpinned seed. (3) THE CODING-PACKET DRAFT PARSES — the single
// codingPacket seed round-trips through codingPacketSchema. (4) THE FORKS ORIGINATE
// FROM A REAL SEED — every branch experiment is non-anonymous (names an agentName),
// so a boot-time fork is never origin-author-less.

describe("conversation seeds — cluster records conform to the protocol schema", () => {
  it("seeds a non-empty opening transcript", () => {
    expect(initialConversationMessages.length).toBeGreaterThan(0);
  });

  it("every seeded conversation message parses against conversationMessageSchema", () => {
    for (const message of initialConversationMessages) {
      expect(conversationMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it("every seeded branch experiment parses against branchExperimentSchema", () => {
    for (const experiment of initialBranchExperiments) {
      expect(branchExperimentSchema.safeParse(experiment).success).toBe(true);
    }
  });

  it("the seeded coding-packet draft parses against codingPacketSchema", () => {
    expect(codingPacketSchema.safeParse(codingPacket).success).toBe(true);
  });
});

describe("conversation seeds — boot-time forks are non-anonymous", () => {
  it("every seeded branch experiment names its authoring agent", () => {
    for (const experiment of initialBranchExperiments) {
      expect(experiment.agentName.length).toBeGreaterThan(0);
    }
  });
});
