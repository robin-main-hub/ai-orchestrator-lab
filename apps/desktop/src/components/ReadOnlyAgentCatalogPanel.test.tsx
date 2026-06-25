import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReadOnlyAgentCatalogPanel } from "./ReadOnlyAgentCatalogPanel";
import type { AgentActivityStatus, WorkbenchAgent } from "../types";
import type { AgentRoleToolRuntimeAudit } from "../lib/agentRuntimeConfig";

/**
 * The library.agents surface must be a read-only catalog: roster summary + safe
 * profile/session metadata only — never a create/edit/delete/activate/assign
 * control, and never a system-prompt / SOUL / AGENTS body, credential, or secret
 * reference value.
 */
const audit: AgentRoleToolRuntimeAudit = {
  totalAgents: 2,
  coveredCount: 2,
  missingAgentIds: [],
  emptyToolAgentIds: [],
  summary: "도구 계약 확인 완료 · 2/2",
};

function agent(over: Partial<WorkbenchAgent> = {}): WorkbenchAgent {
  return {
    id: "agent_1",
    name: "Kurumi",
    kind: "real",
    role: "companion",
    soulMode: "full",
    configSource: "markdown",
    enabled: true,
    providerProfileId: "prov_1",
    modelId: "model_1",
    permissionLevel: "write_files",
    authBinding: {
      mode: "provider_profile",
      label: "binding-label-not-rendered",
      secretRefId: "do-not-render-this-ref",
      oauthRef: "do-not-render-this-oauth",
    },
    isDefault: true,
    ...over,
  } as WorkbenchAgent;
}

describe("ReadOnlyAgentCatalogPanel", () => {
  it("renders roster summary, profile metadata, and runtime status read-only", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyAgentCatalogPanel
        agents={[agent()]}
        activityById={{ agent_1: "responding" as AgentActivityStatus }}
        capabilityAudit={audit}
      />,
    );
    expect(html).toContain("에이전트 로스터"); // roster heading
    expect(html).toContain("전체 1명"); // total count
    expect(html).toContain("Kurumi"); // safe display name
    expect(html).toContain("companion"); // role metadata
    expect(html).toContain("responding"); // runtime/session status
    expect(html).toContain("도구 계약 확인 완료 · 2/2"); // sanitized capability summary
    expect(html).toContain("소울 full"); // soul mode (metadata only)
    expect(html).toContain("설정 markdown"); // config source (metadata only)
  });

  it("renders an honest 'no status' badge when activity is missing (not fabricated)", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyAgentCatalogPanel agents={[agent()]} activityById={{}} capabilityAudit={audit} />,
    );
    expect(html).toContain("상태 없음");
  });

  it("never renders credential / secret reference values", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyAgentCatalogPanel
        agents={[agent()]}
        activityById={{ agent_1: "idle" as AgentActivityStatus }}
        capabilityAudit={audit}
      />,
    );
    expect(html).not.toContain("do-not-render-this-ref");
    expect(html).not.toContain("do-not-render-this-oauth");
    expect(html).not.toContain("binding-label-not-rendered");
  });

  it("has no mutation controls (read-only: no buttons, inputs, or forms)", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyAgentCatalogPanel
        agents={[agent(), agent({ id: "agent_2", name: "Asuka", role: "skeptic", enabled: false })]}
        activityById={{ agent_1: "tooling" as AgentActivityStatus }}
        capabilityAudit={audit}
      />,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<textarea");
  });

  it("renders an honest empty state when there are no agents", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyAgentCatalogPanel
        agents={[]}
        activityById={{}}
        capabilityAudit={{ ...audit, totalAgents: 0, coveredCount: 0 }}
      />,
    );
    expect(html).toContain("등록된 에이전트가 없습니다");
  });
});
