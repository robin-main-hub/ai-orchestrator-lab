import { describe, expect, it } from "vitest";
import {
  CORE_HERMES_ORG,
  EXAMPLE_DOMAIN_WORKFLOW_TEMPLATES,
  missionAgentRoleSchema,
  workflowTemplateSchema,
} from "./index.js";

describe("EXAMPLE_DOMAIN workflow templates", () => {
  it("all templates are schema-valid with known agent roles", () => {
    for (const template of EXAMPLE_DOMAIN_WORKFLOW_TEMPLATES) {
      expect(() => workflowTemplateSchema.parse(template)).not.toThrow();
      for (const role of template.defaultAgents) {
        expect(() => missionAgentRoleSchema.parse(role)).not.toThrow();
      }
      expect(template.outputArtifacts.length).toBeGreaterThan(0);
      expect(template.inputFields.length).toBeGreaterThan(0);
    }
  });

  it("covers the three EXAMPLE_DOMAIN business flows", () => {
    const ids = EXAMPLE_DOMAIN_WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("example-domain_htv_quote");
    expect(ids).toContain("example-domain_material_research");
    expect(ids).toContain("example-domain_sample_request");
    expect(EXAMPLE_DOMAIN_WORKFLOW_TEMPLATES.find((t) => t.id === "example-domain_htv_quote")?.domain).toBe("sales");
  });
});

describe("core Hermes org (4~6 personas, capability-bound)", () => {
  it("is a small org with valid roles and explicit write policies", () => {
    expect(CORE_HERMES_ORG.length).toBeGreaterThanOrEqual(4);
    expect(CORE_HERMES_ORG.length).toBeLessThanOrEqual(6);
    for (const member of CORE_HERMES_ORG) {
      expect(() => missionAgentRoleSchema.parse(member.role)).not.toThrow();
    }
  });

  it("enforces the capability policy: companion no direct mutation, builder sandbox-only, verifier no write", () => {
    const byRole = (role: string) => CORE_HERMES_ORG.find((m) => m.role === role);
    expect(byRole("companion")?.writePolicy).toBe("no_direct_mutation");
    expect(byRole("builder")?.writePolicy).toBe("sandbox_build_only");
    expect(byRole("verifier")?.writePolicy).toBe("verify_no_write");
  });
});
