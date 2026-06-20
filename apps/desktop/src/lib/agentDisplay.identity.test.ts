import { describe, expect, it } from "vitest";
import {
  agentDisplayRoleLabelByIdentity,
  agentIdentityKey,
  agentKoreanNameByIdentity,
} from "./agentDisplay";

// Characterization tests for the three agentDisplay exports the existing
// agentDisplay.test.ts leaves directly uncovered (no behavior change). That
// suite pins the composed functions (agentPrimaryDisplayName /
// agentSecondaryDisplayLabel / agentInitialsForDisplay) through WorkbenchAgent
// fixtures, but the identity-key resolver and the two lookup tables those
// functions read are not asserted head-on. The module is pure: it imports only
// the WorkbenchAgent type + the pure agentRoleLabel helper, no React/DOM/
// network. We pin agentIdentityKey's personaName ?? role precedence and the
// table invariants (alias consistency, role-override membership) the composed
// functions depend on.

describe("agentIdentityKey", () => {
  it("prefers personaName when present, otherwise falls back to role", () => {
    expect(agentIdentityKey({ personaName: "yohane", role: "skeptic" })).toBe("yohane");
    expect(agentIdentityKey({ personaName: undefined, role: "orchestrator" })).toBe("orchestrator");
  });
});

describe("agentKoreanNameByIdentity", () => {
  it("maps role and persona keys to the same name for shared-portrait aliases", () => {
    expect(agentKoreanNameByIdentity.auditor).toBe("가사이 유노");
    expect(agentKoreanNameByIdentity.yuno).toBe(agentKoreanNameByIdentity.auditor);
    expect(agentKoreanNameByIdentity.companion).toBe("쿠루미");
    expect(agentKoreanNameByIdentity.kurumi).toBe(agentKoreanNameByIdentity.companion);
  });

  it("assigns a non-empty display name to every identity key", () => {
    const entries = Object.entries(agentKoreanNameByIdentity);
    expect(entries.length).toBe(20);
    for (const [key, name] of entries) {
      expect(name.length, key).toBeGreaterThan(0);
    }
  });
});

describe("agentDisplayRoleLabelByIdentity", () => {
  it("only overrides the two personas that need a distinct secondary label", () => {
    expect(Object.keys(agentDisplayRoleLabelByIdentity).sort()).toEqual(["skeptic", "yohane"]);
    expect(agentDisplayRoleLabelByIdentity.skeptic).toBe("UX 비판자");
    expect(agentDisplayRoleLabelByIdentity.yohane).toBe("4차원 아이디어 뱅크");
  });
});
