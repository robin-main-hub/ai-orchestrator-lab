import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import {
  agentRoleLabel,
  defaultCreativityForRole,
  defaultVoicePresetForRole,
  formatAttachmentSize,
  getAgentInitials,
  getMessageAttachments,
  slugifyProviderName,
} from "./helpers";

type Role = WorkbenchAgent["role"];

// Characterization tests for the agent identity / role-default / formatting
// helpers in helpers.ts (no behavior change, distinct slice from the
// provider-label tests and the existing attachmentHelpers tests). These pin the
// role→voice/creativity/label maps and their else-branch defaults, the initials
// and slug normalization, the human-readable attachment size buckets, and the
// message-attachment validation filter + cap. All pure.
describe("defaultVoicePresetForRole", () => {
  it("maps roles to presets with a 'direct' default", () => {
    expect(defaultVoicePresetForRole("architect")).toBe("architect");
    expect(defaultVoicePresetForRole("reviewer")).toBe("reviewer");
    expect(defaultVoicePresetForRole("skeptic")).toBe("reviewer");
    expect(defaultVoicePresetForRole("executor")).toBe("executor");
    expect(defaultVoicePresetForRole("builder")).toBe("executor");
    expect(defaultVoicePresetForRole("memory_curator")).toBe("calm");
    expect(defaultVoicePresetForRole("auditor")).toBe("calm");
    expect(defaultVoicePresetForRole("companion")).toBe("direct"); // fallthrough
  });
});

describe("defaultCreativityForRole", () => {
  it("maps roles to creativity with a 'balanced' default", () => {
    expect(defaultCreativityForRole("architect")).toBe("creative");
    expect(defaultCreativityForRole("skeptic")).toBe("creative");
    expect(defaultCreativityForRole("reviewer")).toBe("focused");
    expect(defaultCreativityForRole("verifier")).toBe("focused");
    expect(defaultCreativityForRole("auditor")).toBe("focused");
    expect(defaultCreativityForRole("executor")).toBe("strict");
    expect(defaultCreativityForRole("external")).toBe("strict");
    expect(defaultCreativityForRole("orchestrator")).toBe("balanced"); // fallthrough
  });
});

describe("agentRoleLabel", () => {
  it("returns a Korean label for every declared role", () => {
    const expected: Record<Role, string> = {
      architect: "설계자",
      auditor: "감사자",
      builder: "구현자",
      executor: "실행자",
      external: "외부 응대자",
      memory_curator: "기억 관리자",
      orchestrator: "지휘자",
      reviewer: "검토자",
      skeptic: "비판자",
      verifier: "검증자",
      researcher: "정보 수집가",
      negotiator: "협상 자문",
      risk_officer: "위험 분석가",
      mediator: "의견 조율자",
      watchdog: "장기 모니터",
      domain_expert: "도메인 전문가",
      companion: "전속 비서",
    };
    for (const [role, label] of Object.entries(expected) as Array<[Role, string]>) {
      expect(agentRoleLabel(role)).toBe(label);
    }
  });
});

describe("getAgentInitials", () => {
  it("falls back to AI when blank", () => {
    expect(getAgentInitials("")).toBe("AI");
    expect(getAgentInitials("   ")).toBe("AI");
  });

  it("takes the first two chars of a single token, upper-cased", () => {
    expect(getAgentInitials("orchestrator")).toBe("OR");
    expect(getAgentInitials("a")).toBe("A");
  });

  it("takes one char from each of the first two tokens", () => {
    expect(getAgentInitials("Kurumi Tokisaki")).toBe("KT");
    expect(getAgentInitials("one two three")).toBe("OT");
  });
});

describe("slugifyProviderName", () => {
  it("lowercases, dashes non-alphanumerics, and trims edge dashes", () => {
    expect(slugifyProviderName("  My Provider!! ", "fallback")).toBe("my-provider");
    expect(slugifyProviderName("MiMo_v2.5", "fallback")).toBe("mimo-v2-5");
  });

  it("uses the fallback when the slug collapses to empty", () => {
    expect(slugifyProviderName("***", "prov_1")).toBe("prov_1");
  });
});

describe("formatAttachmentSize", () => {
  it("buckets into B / KB / MB", () => {
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(1024)).toBe("1.0 KB");
    expect(formatAttachmentSize(1536)).toBe("1.5 KB");
    expect(formatAttachmentSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("getMessageAttachments", () => {
  function message(attachments: unknown): ConversationMessage {
    return { metadata: { attachments } } as unknown as ConversationMessage;
  }

  const validAttachment = {
    id: "a1",
    name: "doc.pdf",
    kind: "document",
    mimeType: "application/pdf",
    size: 1234,
    storage: "metadata_only",
  };

  it("returns [] when attachments is not an array", () => {
    expect(getMessageAttachments(message(undefined))).toEqual([]);
    expect(getMessageAttachments(message("nope"))).toEqual([]);
  });

  it("drops malformed entries and keeps well-formed ones", () => {
    const result = getMessageAttachments(
      message([validAttachment, { id: "x" }, null, { ...validAttachment, kind: "weird" }]),
    );
    expect(result.map((a) => a.id)).toEqual(["a1"]);
  });

  it("caps the list at the max draft attachment count (5)", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...validAttachment, id: `a${i}` }));
    expect(getMessageAttachments(message(many))).toHaveLength(5);
  });
});
