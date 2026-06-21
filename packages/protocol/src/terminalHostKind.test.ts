import { describe, expect, it } from "vitest";
import { terminalHostKindSchema, tmuxSessionRefSchema } from "./index.js";

// terminalHostKindSchema is the CLOSED REGISTRY OF DISPATCH TARGETS — the set of
// physical/logical terminal hosts the OS is allowed to reach. Every host-bearing
// record (tmuxSessionRef / terminalPane / terminalTimelineBlock / terminalPaneTimeline /
// terminalCommandIntent…) embeds it by value, yet it is referenced by NO test: the
// sibling tmuxSessionRef.test.ts pins the session/pane STATUS vocabs but every host
// fixture is the lone literal "local_mac" — the host vocabulary itself (its full
// membership, the rejection of an unmodelled host, the locked host as a named member)
// is never asserted. The FRESH authority angle here is DISPATCH-TARGET REGISTRY
// INTEGRITY: a command can never be aimed at a host the OS does not model. (1) EXACTLY
// FOUR DECLARED TARGETS — {local_mac, home_pc, dgx_02, dgx_01_locked}; an unknown host
// (dgx_03, aws_ec2) is rejected, so a dispatch target is always one of the modelled
// hosts. (2) THE LOCKED HOST IS A FIRST-CLASS MEMBER — dgx_01_locked is a DECLARED
// member, not an omission: the OS can name and reason about the locked host (quarantine,
// refuse-to-dispatch) rather than treating it as an unknown that slips through some
// other code path. (3) NO IMPLICIT DEFAULT — a bare z.enum (no `.default()`): a record
// must name its host explicitly; parsing `undefined` fails, so nothing silently lands
// on a default host. (4) THE RECORD CANNOT HOLD AN UNMODELLED HOST — tmuxSessionRef
// embeds the host by value, so a session ref carrying an unknown host is transitively
// rejected even though the plain z.object would otherwise strip an unknown KEY. Enum
// members read back via `.options`.

const session = {
  id: "ts-1",
  sessionName: "ai-swarm",
  host: "local_mac",
  backend: "tmux",
  attachCommand: "tmux attach -t ai-swarm",
  controlMode: false,
  paneCount: 10,
  createdAt: "2026-06-21T00:00:00.000Z",
  status: "detached",
};

describe("terminalHostKind — closed dispatch-target registry", () => {
  it("admits exactly the four declared hosts and rejects an unmodelled one", () => {
    expect(terminalHostKindSchema.options).toEqual([
      "local_mac",
      "home_pc",
      "dgx_02",
      "dgx_01_locked",
    ]);
    expect(terminalHostKindSchema.safeParse("dgx_03").success).toBe(false);
    expect(terminalHostKindSchema.safeParse("aws_ec2").success).toBe(false);
  });

  it("declares the locked host as a first-class, nameable member", () => {
    expect(terminalHostKindSchema.safeParse("dgx_01_locked").success).toBe(true);
  });

  it("has no implicit default — an absent host is an error, not a fallback", () => {
    expect(terminalHostKindSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("terminalHostKind — the record cannot hold an unmodelled host", () => {
  it("accepts a session ref aimed at a declared host", () => {
    expect(tmuxSessionRefSchema.safeParse(session).success).toBe(true);
  });

  it("transitively rejects a session ref carrying an unknown host (by-value embed)", () => {
    expect(tmuxSessionRefSchema.safeParse({ ...session, host: "dgx_03" }).success).toBe(false);
  });
});
