import { describe, expect, it } from "vitest";
import {
  buildMissionCreateFromTemplate,
  CORE_HERMES_ORG,
  CORE_WORKFLOW_TEMPLATES,
  findWorkflowTemplate,
  missingRequiredFields,
  missionAgentRoleSchema,
  missionCreateRequestSchema,
  missionFromTemplateRequestSchema,
  plannedArtifactsFromTemplate,
  TEMPLATE_REACT_VITE_APP,
  workflowDomainSchema,
  workflowInputFieldSchema,
  workflowTemplateSchema,
  type WorkflowTemplate,
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

// The core templates + happy-path mission build are covered above, but three
// surfaces stay unpinned: (1) workflowDomainSchema is the 0-ref vocabulary that
// DECLARES the four business domains (sales/research/sample/claim) the isolation
// contract relies on — the existing test only asserts core templates use
// coding/design, never that the other four are even valid domains a domain-pack
// could carry, so a silent removal of "sales" would pass today. (2) missionFrom-
// TemplateRequestSchema (the wire contract for "run this template") defaults
// input to {} and bounds templateId — untested. (3) buildMissionCreateFromTemplate
// only ever runs with a single template whose roles all have a ROLE_LABEL; the
// agentId format, the displayName fallback for an UNLABELED role, the soulMode/
// configSource constants, and the empty-input title/goal shaping are all
// uncovered branches. Pin them, self-consistent (derived from the template/schema).
describe("workflowTemplate vocabulary + request schema + mission shaping", () => {
  it("pins the workflow-domain enum: generic (coding/design) PLUS the four isolated business domains", () => {
    expect(workflowDomainSchema.options).toEqual(["coding", "design", "sales", "research", "sample", "claim"]);
    // the business domains are DECLARED in the vocab but MUST NOT appear in the core registry (isolation both directions)
    const coreDomains = new Set(CORE_WORKFLOW_TEMPLATES.map((t) => t.domain));
    for (const business of ["sales", "research", "sample", "claim"]) {
      expect(workflowDomainSchema.options).toContain(business); // a domain pack could legally carry it
      expect(coreDomains.has(business as never)).toBe(false); // ...but the product core never does
    }
  });

  it("missionFromTemplateRequestSchema defaults input to {}, bounds templateId, keeps missionId optional", () => {
    const parsed = missionFromTemplateRequestSchema.parse({ templateId: "react_vite_app" });
    expect(parsed.input).toEqual({}); // default
    expect(parsed.missionId).toBeUndefined(); // optional
    // numeric AND string input values are both accepted
    expect(missionFromTemplateRequestSchema.safeParse({ templateId: "t", input: { count: 3, name: "x" } }).success).toBe(true);
    // empty templateId is rejected (min(1))
    expect(missionFromTemplateRequestSchema.safeParse({ templateId: "" }).success).toBe(false);
  });

  it("buildMissionCreateFromTemplate shapes worker ids/displayNames and uses summary/internal config constants", () => {
    const request = buildMissionCreateFromTemplate(TEMPLATE_REACT_VITE_APP, { appName: "demo" }, { missionId: "m_tpl_1" });
    request.workers.forEach((worker, index) => {
      // agentId = `${template.id}_${role}_${index+1}`
      expect(worker.agentId).toBe(`react_vite_app_${worker.role}_${index + 1}`);
      expect(worker.soulMode).toBe("summary");
      expect(worker.configSource).toBe("internal");
    });
    // architect → 설계자 (ROLE_LABEL mapping, not the raw role)
    expect(request.workers.find((w) => w.role === "architect")?.displayName).toBe("설계자");
    expect(request.createdBy).toBe("workflow_template"); // default when not provided
  });

  it("an UNLABELED role falls back to the raw role string as displayName", () => {
    // "external" is a valid mission role but has NO ROLE_LABEL entry → displayName === role
    const synthetic: WorkflowTemplate = {
      ...TEMPLATE_REACT_VITE_APP,
      id: "synthetic_tpl",
      defaultAgents: ["external"],
    };
    const request = buildMissionCreateFromTemplate(synthetic, {}, { missionId: "m_syn", createdBy: "tester" });
    expect(request.workers[0]!.displayName).toBe("external"); // raw role fallback
    expect(request.workers[0]!.agentId).toBe("synthetic_tpl_external_1");
    expect(request.createdBy).toBe("tester"); // explicit createdBy wins over the default
  });

  it("empty input → title carries no ' — ' suffix and goal omits the 입력 line (no blank fields)", () => {
    const request = buildMissionCreateFromTemplate(TEMPLATE_REACT_VITE_APP, {}, { missionId: "m_empty" });
    expect(request.title).toBe("React + Vite 앱"); // no summary suffix
    expect(request.goal).not.toContain("입력 —"); // no empty input line
    expect(request.goal).toContain("계획 —"); // plan/검증/산출물 still present
    expect(request.goal).toContain("외부 발송 금지 — draft만 생성한다.");
  });
});

// missingRequiredFields is the gate that decides whether a template can run, but
// only its whitespace-missing arm is tested above ({ appName: "  " }). Its other
// branches carry the real contract: ONLY `required` fields can block (an absent
// optional never reports), the empty-check is string-only so a NUMBER value
// (even 0) always counts as present, and it returns EVERY still-missing required
// key in declaration order. Pin them on a synthetic template with mixed
// required/optional + text/number fields (the field config is the oracle).
describe("missingRequiredFields — required-only, string-only empty check, all keys in order", () => {
  const tpl: WorkflowTemplate = {
    ...TEMPLATE_REACT_VITE_APP,
    id: "synthetic_required_tpl",
    inputFields: [
      { key: "name", label: "이름", type: "text", required: true, options: undefined },
      { key: "count", label: "개수", type: "number", required: true, options: undefined },
      { key: "note", label: "메모", type: "text", required: false, options: undefined },
    ],
  };

  it("reports only required fields that are absent — an absent OPTIONAL never blocks", () => {
    // name + count required and absent; note optional and absent → only required reported
    expect(missingRequiredFields(tpl, {})).toEqual(["name", "count"]);
    // supplying the optional only does not satisfy the required ones
    expect(missingRequiredFields(tpl, { note: "anything" })).toEqual(["name", "count"]);
  });

  it("treats a NUMBER value (even 0) as present — the empty/trim check is string-only", () => {
    // count=0 is present (not undefined, not a string → never trimmed to empty)
    expect(missingRequiredFields(tpl, { name: "app", count: 0 })).toEqual([]);
    // a non-empty string for count would also pass; whitespace string would NOT
    expect(missingRequiredFields(tpl, { name: "app", count: "   " })).toEqual(["count"]);
  });

  it("whitespace-only and undefined both count as missing; returns keys in declaration order", () => {
    // name whitespace (missing), count absent (missing) → both, in field order
    expect(missingRequiredFields(tpl, { name: "  " })).toEqual(["name", "count"]);
    // satisfy name, leave count → only count
    expect(missingRequiredFields(tpl, { name: "app" })).toEqual(["count"]);
  });
});

// workflowTemplateSchema is parsed end-to-end above, but its LEAF —
// workflowInputFieldSchema — is never asserted on its own, yet it is the schema
// that defines what a runnable input field can be, and the `required` default is
// load-bearing: missingRequiredFields only blocks on `required:true`, so a field
// that omits `required` MUST parse to false (an undeclared field can never
// silently block a template). Pin: required key/label, the closed 4-type enum
// {text,number,select,textarea}, the honest required→false default, the optional
// options never fabricated when absent, no-smuggle stripping, and that every
// inputField the core registry actually declares is valid against this leaf
// (self-consistent — the templates are the oracle).
describe("workflowInputFieldSchema — leaf input contract: required key/label, closed type enum, honest required default, optional options, no-smuggle", () => {
  const BASE = { key: "appName", label: "앱 이름", type: "text" } as const;

  it("requires key/label, closes the type enum, and accepts every field the core registry declares", () => {
    for (const template of CORE_WORKFLOW_TEMPLATES) {
      for (const inputField of template.inputFields) {
        expect(workflowInputFieldSchema.safeParse(inputField).success).toBe(true); // leaf agrees with the templates
      }
    }
    expect(workflowInputFieldSchema.shape.type.options).toEqual(["text", "number", "select", "textarea"]); // closed type vocab
    expect(workflowInputFieldSchema.safeParse({ ...BASE, type: "date" }).success).toBe(false); // outside the set
    for (const field of ["key", "label", "type"] as const) {
      const { [field]: _omit, ...without } = BASE;
      expect(workflowInputFieldSchema.safeParse(without).success).toBe(false); // key/label/type all required
    }
  });

  it("defaults required→false (an undeclared field never blocks), keeps options optional, passes through, and strips smuggled keys", () => {
    const parsed = workflowInputFieldSchema.parse(BASE);
    expect(parsed.required).toBe(false); // honest default — not required unless declared
    expect(parsed.options).toBeUndefined(); // optional never fabricated (a text field has no options)
    expect(workflowInputFieldSchema.parse({ ...BASE, required: true }).required).toBe(true); // passthrough
    const select = workflowInputFieldSchema.parse({ key: "color", label: "색", type: "select", options: ["red", "blue"] });
    expect(select.options).toEqual(["red", "blue"]); // a select legitimately carries options
    const stripped = workflowInputFieldSchema.parse({ ...BASE, placeholder: "x" } as Record<string, unknown>);
    expect("placeholder" in stripped).toBe(false); // plain z.object strips
  });
});
