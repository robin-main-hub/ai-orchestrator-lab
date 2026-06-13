import { describe, expect, it } from "vitest";
import {
  buildMissionCreateFromTemplate,
  CORE_HERMES_ORG,
  findWorkflowTemplate,
  EXAMPLE_DOMAIN_HTV_QUOTE_TEMPLATE,
  EXAMPLE_DOMAIN_WORKFLOW_TEMPLATES,
  missingRequiredFields,
  missionAgentRoleSchema,
  missionCreateRequestSchema,
  plannedArtifactsFromTemplate,
  workflowTemplateSchema,
} from "./index.js";

const now = () => "2026-06-13T00:00:00.000Z";

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

describe("template → mission (L7)", () => {
  const fullInput = {
    productType: "HTV 시트",
    material: "유리비드",
    quantity: 1000,
    size: "A4",
    color: "실버",
    leadTime: "30일",
    incoterms: "FOB",
  };

  it("finds EXAMPLE_DOMAIN templates by id", () => {
    expect(findWorkflowTemplate("example-domain_htv_quote")?.title).toBe("HTV 견적");
    expect(findWorkflowTemplate("nope")).toBeUndefined();
  });

  it("reports missing required fields (empty strings count as missing)", () => {
    const missing = missingRequiredFields(EXAMPLE_DOMAIN_HTV_QUOTE_TEMPLATE, { productType: "x", material: "  " });
    expect(missing).toContain("material"); // 공백은 누락
    expect(missing).toContain("quantity");
    expect(missing).not.toContain("customerRequest"); // 선택 필드
  });

  it("builds a schema-valid MissionCreateRequest with workers from defaultAgents and planned truth", () => {
    const request = buildMissionCreateFromTemplate(EXAMPLE_DOMAIN_HTV_QUOTE_TEMPLATE, fullInput, { missionId: "m_tpl_1" });
    expect(() => missionCreateRequestSchema.parse(request)).not.toThrow();
    expect(request.id).toBe("m_tpl_1");
    expect(request.truthStatus).toBe("planned"); // 실측 0건 — observed 아님
    expect(request.workers.map((w) => w.role)).toEqual(EXAMPLE_DOMAIN_HTV_QUOTE_TEMPLATE.defaultAgents);
    expect(request.goal).toContain("외부 발송 금지");
  });

  it("plans output artifacts as planned drafts (no external send, never observed)", () => {
    const artifacts = plannedArtifactsFromTemplate(EXAMPLE_DOMAIN_HTV_QUOTE_TEMPLATE, "m_tpl_1", now);
    expect(artifacts.length).toBe(EXAMPLE_DOMAIN_HTV_QUOTE_TEMPLATE.outputArtifacts.length);
    expect(artifacts.every((a) => a.truthStatus === "planned")).toBe(true);
    expect(artifacts.every((a) => a.missionId === "m_tpl_1")).toBe(true);
  });
});
