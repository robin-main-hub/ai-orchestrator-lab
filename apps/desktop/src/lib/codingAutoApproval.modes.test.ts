import { describe, expect, it } from "vitest";
import {
  CODING_APPROVAL_MODE_STORAGE_KEY,
  CODING_APPROVAL_MODES,
  CODING_APPROVED_PREFIXES_STORAGE_KEY,
  CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY,
  CODING_AUTO_APPROVAL_WARNING,
  isAutoMode,
  isCodingApprovalMode,
  type CodingApprovalMode,
} from "./codingAutoApproval";

// Characterization tests (no behavior change) for the static metadata / copy /
// storage-key surface of codingAutoApproval.ts that the existing
// codingAutoApproval.test.ts leaves unasserted (that suite pins the functions:
// isCodingApprovalMode, parseStoredApprovalMode, isAutoMode,
// shouldShowAutoApprovalWarning, codingApprovalConfig, approvedPrefixCandidate,
// addApprovedPrefix, removeApprovedPrefix, parseStoredApprovedPrefixes — but
// never the CODING_APPROVAL_MODES table, the warning copy, or the keys).
//
// The load-bearing invariant pinned here is the safety boundary: every mode
// whose requiresArmConfirmation flag is true must be exactly the set of auto
// modes (isAutoMode). manual must NOT require arm-confirmation; every auto mode
// MUST. If a future edit flips a flag out of step with isAutoMode, this surfaces.

const EXPECTED_MODE_ORDER: CodingApprovalMode[] = [
  "manual",
  "auto_safe",
  "session_allow",
  "guided_auto",
];

describe("CODING_APPROVAL_MODES", () => {
  it("declares exactly the CodingApprovalMode union, in stable order", () => {
    expect(CODING_APPROVAL_MODES.map((meta) => meta.id)).toEqual(EXPECTED_MODE_ORDER);
  });

  it("every listed id is a valid CodingApprovalMode with non-empty label/hint", () => {
    for (const meta of CODING_APPROVAL_MODES) {
      expect(isCodingApprovalMode(meta.id), meta.id).toBe(true);
      expect(meta.label.length, meta.id).toBeGreaterThan(0);
      expect(meta.hint.length, meta.id).toBeGreaterThan(0);
    }
  });

  it("requires arm-confirmation iff the mode is an auto mode (safety boundary)", () => {
    for (const meta of CODING_APPROVAL_MODES) {
      expect(meta.requiresArmConfirmation, meta.id).toBe(isAutoMode(meta.id));
    }
    // and concretely: manual is the only non-armed mode
    const armed = CODING_APPROVAL_MODES.filter((meta) => meta.requiresArmConfirmation).map((meta) => meta.id);
    expect(armed).toEqual(["auto_safe", "session_allow", "guided_auto"]);
  });
});

describe("CODING_AUTO_APPROVAL_WARNING", () => {
  it("is a 3-line confirmation copy, each line non-empty", () => {
    const lines = CODING_AUTO_APPROVAL_WARNING.split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("storage keys", () => {
  it("pins the three versioned, distinct localStorage keys", () => {
    expect(CODING_APPROVAL_MODE_STORAGE_KEY).toBe("ai-orchestrator.coding-approval-mode.v2");
    expect(CODING_APPROVED_PREFIXES_STORAGE_KEY).toBe("ai-orchestrator.coding-approved-prefixes.v2");
    expect(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY).toBe("ai-orchestrator.coding-auto-approval-armed.v1");
    const keys = [
      CODING_APPROVAL_MODE_STORAGE_KEY,
      CODING_APPROVED_PREFIXES_STORAGE_KEY,
      CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY,
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
