import { describe, expect, it } from "vitest";
import type { PermissionActor } from "@ai-orchestrator/protocol";
import {
  actorLabel,
  normalizePersonaRoleSlug,
  resolveIdentityInitial,
  resolvePersonaIdentity,
  resolveRequesterName,
} from "./personaIdentity";

describe("actorLabel", () => {
  it("maps every actor enum member", () => {
    expect(actorLabel("user")).toBe("운영자");
    expect(actorLabel("agent")).toBe("에이전트");
    expect(actorLabel("external_channel")).toBe("외부 채널");
    expect(actorLabel("mobile")).toBe("모바일");
    expect(actorLabel("server")).toBe("서버");
  });

  it("falls back to 에이전트 for an unknown actor", () => {
    expect(actorLabel("ghost" as PermissionActor)).toBe("에이전트");
  });
});

describe("resolveRequesterName", () => {
  it("uses the trimmed name when present", () => {
    expect(resolveRequesterName({ name: "시노부", actor: "agent" })).toBe("시노부");
  });

  it("falls back to the actor label for a blank name", () => {
    expect(resolveRequesterName({ name: "   ", actor: "user" })).toBe("운영자");
    expect(resolveRequesterName({ actor: "server" })).toBe("서버");
  });
});

describe("resolveIdentityInitial", () => {
  it("returns the uppercased first code point", () => {
    expect(resolveIdentityInitial("robin")).toBe("R");
    expect(resolveIdentityInitial("  시스템 ")).toBe("시");
    expect(resolveIdentityInitial("")).toBe("?");
  });
});

describe("normalizePersonaRoleSlug", () => {
  it("maps aliases to canonical persona keys", () => {
    expect(normalizePersonaRoleSlug("Implementer")).toBe("builder");
    expect(normalizePersonaRoleSlug("QA/Verifier")).toBe("verifier");
    expect(normalizePersonaRoleSlug("qa-verifier")).toBe("verifier");
    expect(normalizePersonaRoleSlug("qa_verifier")).toBe("verifier");
  });

  it("passes through already-canonical keys", () => {
    expect(normalizePersonaRoleSlug("architect")).toBe("architect");
    expect(normalizePersonaRoleSlug("Memory Curator")).toBe("memory_curator");
  });

  it("returns undefined for empty input", () => {
    expect(normalizePersonaRoleSlug(undefined)).toBeUndefined();
    expect(normalizePersonaRoleSlug("   ")).toBeUndefined();
  });
});

describe("resolvePersonaIdentity", () => {
  it("resolves a known persona to its Korean name", () => {
    const identity = resolvePersonaIdentity({ personaName: "orchestrator" });
    expect(identity.displayName).toBe("마키마");
    expect(identity.isFallback).toBe(false);
    expect(identity.initials).toBe("마키");
  });

  it("falls back to the actor label for an unknown persona with no name", () => {
    const identity = resolvePersonaIdentity({ personaName: "nope-persona", actor: "user" });
    expect(identity.displayName).toBe("운영자");
    expect(identity.isFallback).toBe(true);
    expect(identity.initials).toBe("운");
  });

  it("falls back to 시스템 when nothing is known", () => {
    const identity = resolvePersonaIdentity({});
    expect(identity.displayName).toBe("시스템");
    expect(identity.isFallback).toBe(true);
  });

  it("normalizes the role into a persona slug", () => {
    const identity = resolvePersonaIdentity({ role: "implementer" });
    expect(identity.roleSlug).toBe("builder");
  });
});
