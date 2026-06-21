import { describe, expect, it } from "vitest";
import { agentAuthBindingSchema, agentKindSchema, soulInjectionModeSchema } from "./index.js";

// agentAuthBindingSchema is the record that binds an agent to the SOURCE OF ITS
// AUTHORITY — how it is allowed to call a provider — and the two enums beside it
// (agentKind, soulInjectionMode) classify what kind of actor the agent is and how
// much of its persona is loaded. None of the three were pinned: agentProfileSchema
// is referenced elsewhere but only its configSource vocab + persona metadata are
// pinned there; kind/soulMode are only ever used at their happy-path values, and
// an authBinding is never constructed in any test. The FRESH authority angle here
// is CREDENTIAL-BY-REFERENCE BINDING: an agent's authority binding NAMES where its
// authority comes from but can only ever hold REFERENCES to a credential, never an
// inline secret. (1) CLOSED ACTOR/SOUL VOCABS — agentKind is exactly {real,
// virtual} (a real agent vs a synthesized debate persona) and soulInjectionMode is
// exactly {full, summary, retrieved, off}; an unknown member is rejected, so an
// agent can never be classified outside the declared actor/soul taxonomy. (2)
// CLOSED BINDING MODE — agentAuthBinding.mode is exactly {provider_profile, oauth,
// local}; mode + label are REQUIRED, but the three pointer fields
// (providerProfileId, oauthRef, secretRefId) are ALL OPTIONAL — a binding can name
// where its secret lives or carry none, but the schema has NO field to hold a raw
// secret inline. (3) PLAIN-OBJECT STRIP IS THE SECRET GUARD — being a plain
// z.object, a binding that tries to smuggle a raw `secret` / `apiKey` / `token` key
// gets it STRIPPED, not carried: the binding structurally cannot persist an inline
// credential, only a reference to one. Enum members read back via `.options`.

const binding = {
  mode: "provider_profile",
  label: "Anthropic prod",
  providerProfileId: "pp-1",
};

describe("agent actor/soul taxonomy — closed classification vocabularies", () => {
  it("agentKind admits exactly {real, virtual}", () => {
    expect(agentKindSchema.options).toEqual(["real", "virtual"]);
    expect(agentKindSchema.safeParse("daemon").success).toBe(false);
  });

  it("soulInjectionMode admits exactly {full, summary, retrieved, off}", () => {
    expect(soulInjectionModeSchema.options).toEqual(["full", "summary", "retrieved", "off"]);
    expect(soulInjectionModeSchema.safeParse("partial").success).toBe(false);
  });
});

describe("agentAuthBinding — credential-by-reference binding", () => {
  it("accepts a minimal binding (only mode + label required)", () => {
    expect(agentAuthBindingSchema.safeParse({ mode: "local", label: "on-device" }).success).toBe(true);
  });

  it("accepts a fully-specified binding (every pointer field present)", () => {
    const full = {
      mode: "oauth",
      label: "Claude Max",
      providerProfileId: "pp-2",
      oauthRef: "oauth-1",
      secretRefId: "secret-1",
    };
    expect(agentAuthBindingSchema.safeParse(full).success).toBe(true);
  });

  it("requires mode and label", () => {
    const { mode: _omitMode, ...noMode } = binding;
    const { label: _omitLabel, ...noLabel } = binding;
    expect(agentAuthBindingSchema.safeParse(noMode).success).toBe(false);
    expect(agentAuthBindingSchema.safeParse(noLabel).success).toBe(false);
  });

  it("rejects an unknown binding mode (mode is a closed vocab)", () => {
    expect(agentAuthBindingSchema.safeParse({ ...binding, mode: "raw_key" }).success).toBe(false);
  });
});

describe("agentAuthBinding — plain-object strip is the inline-secret guard", () => {
  it("strips a smuggled raw secret rather than carrying it on the binding", () => {
    const parsed = agentAuthBindingSchema.parse({
      ...binding,
      secret: "sk-live-RAW",
      apiKey: "key-RAW",
      token: "tok-RAW",
    });
    expect("secret" in parsed).toBe(false);
    expect("apiKey" in parsed).toBe(false);
    expect("token" in parsed).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("RAW");
  });

  it("keeps only the reference pointers it declares", () => {
    const parsed = agentAuthBindingSchema.parse(binding);
    expect(parsed.providerProfileId).toBe("pp-1");
    expect("secretRefId" in parsed).toBe(false); // absent ref stays absent, not nulled
  });
});
