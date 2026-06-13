import { describe, expect, it } from "vitest";
import {
  buildMissionCreateFromTemplate,
  CORE_HERMES_ORG,
  CORE_WORKFLOW_TEMPLATES,
  findWorkflowTemplate,
  missingRequiredFields,
  missionAgentRoleSchema,
  missionCreateRequestSchema,
  plannedArtifactsFromTemplate,
  TEMPLATE_REACT_VITE_APP,
  workflowTemplateSchema,
} from "./index.js";

const now = () => "2026-06-13T00:00:00.000Z";

describe("core workflow templates (Generic App/Design Builder)", () => {
  it("all core templates are schema-valid with known agent roles", () => {
    for (const template of CORE_WORKFLOW_TEMPLATES) {
      expect(() => workflowTemplateSchema.parse(template)).not.toThrow();
      for (const role of template.defaultAgents) {
        expect(() => missionAgentRoleSchema.parse(role)).not.toThrow();
      }
      expect(template.outputArtifacts.length).toBeGreaterThan(0);
      expect(template.inputFields.length).toBeGreaterThan(0);
    }
  });

  it("covers the generic app/design builder templates", () => {
    const ids = CORE_WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("react_vite_app");
    expect(ids).toContain("dashboard_screen");
    expect(ids).toContain("design_system_starter");
    expect(ids).toContain("kanban_board");
  });

  it("carries NO company/business strings or domains in the core registry", () => {
    const blob = JSON.stringify(CORE_WORKFLOW_TEMPLATES);
    for (const banned of ["example-domain", "EXAMPLE_DOMAIN", "HTV", "견적", "샘플", "거래처"]) {
      expect(blob).not.toContain(banned);
    }
    for (const template of CORE_WORKFLOW_TEMPLATES) {
      expect(["coding", "design"]).toContain(template.domain); // sales/research/sample 없음
    }
  });
});

describe("business templates are removed from the product", () => {
  it("the EXAMPLE_DOMAIN business templates are no longer reachable by any id", () => {
    expect(findWorkflowTemplate("example-domain_htv_quote")).toBeUndefined();
    expect(findWorkflowTemplate("example-domain_material_research")).toBeUndefined();
    expect(findWorkflowTemplate("example-domain_sample_request")).toBeUndefined();
    // 코어 generic 템플릿만 남음
    expect(findWorkflowTemplate("react_vite_app")?.title).toBe("React + Vite 앱");
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

describe("template → mission (generic)", () => {
  it("finds core templates by id (business is invisible by default)", () => {
    expect(findWorkflowTemplate("react_vite_app")?.domain).toBe("coding");
    expect(findWorkflowTemplate("nope")).toBeUndefined();
  });

  it("reports missing required fields (empty strings count as missing)", () => {
    const missing = missingRequiredFields(TEMPLATE_REACT_VITE_APP, { appName: "  " });
    expect(missing).toContain("appName"); // 공백은 누락
    expect(missing).not.toContain("description"); // 선택 필드
  });

  it("builds a schema-valid MissionCreateRequest with workers from defaultAgents and planned truth", () => {
    const request = buildMissionCreateFromTemplate(TEMPLATE_REACT_VITE_APP, { appName: "demo" }, { missionId: "m_tpl_1" });
    expect(() => missionCreateRequestSchema.parse(request)).not.toThrow();
    expect(request.id).toBe("m_tpl_1");
    expect(request.truthStatus).toBe("planned"); // 실측 0건 — observed 아님
    expect(request.workers.map((w) => w.role)).toEqual(TEMPLATE_REACT_VITE_APP.defaultAgents);
    expect(request.goal).toContain("외부 발송 금지");
  });

  it("plans output artifacts as planned drafts (no external send, never observed)", () => {
    const artifacts = plannedArtifactsFromTemplate(TEMPLATE_REACT_VITE_APP, "m_tpl_1", now);
    expect(artifacts.length).toBe(TEMPLATE_REACT_VITE_APP.outputArtifacts.length);
    expect(artifacts.every((a) => a.truthStatus === "planned")).toBe(true);
    expect(artifacts.every((a) => a.missionId === "m_tpl_1")).toBe(true);
  });
});
