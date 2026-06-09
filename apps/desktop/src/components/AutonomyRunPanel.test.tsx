import type { AgentSession } from "@ai-orchestrator/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_AUTONOMY_FORM, type AutonomyRunForm } from "../lib/autonomyRunForm";
import type { SummonRegistry } from "../lib/personaSummon";
import type { PersonaTaskOutcome } from "../lib/personaTaskRunner";
import { AutonomyRunPanel } from "./AutonomyRunPanel";

const noop = () => {};

const form = (overrides: Partial<AutonomyRunForm> = {}): AutonomyRunForm => ({
  ...DEFAULT_AUTONOMY_FORM,
  ...overrides,
});

function render(props: Partial<Parameters<typeof AutonomyRunPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <AutonomyRunPanel
      form={props.form ?? form()}
      runnable={props.runnable ?? { ok: true }}
      running={props.running ?? false}
      outcome={props.outcome ?? null}
      error={props.error ?? null}
      onFieldChange={noop}
      onRun={noop}
    />,
  );
}

describe("AutonomyRunPanel", () => {
  it("renders the form controls and mode/role options", () => {
    const html = render();
    expect(html).toContain("자율 실행");
    expect(html).toContain("페르소나");
    expect(html).toContain("검증 단계");
    expect(html).toContain("safe 자동승인");
    expect(html).toContain("qa"); // a selectable pane role
  });

  it("disables the run button and shows the reason when not runnable", () => {
    const html = render({ runnable: { ok: false, reason: "목표(goal)가 필요합니다" } });
    expect(html).toContain("disabled");
    expect(html).toContain("목표(goal)가 필요합니다");
  });

  it("shows the running state", () => {
    const html = render({ running: true });
    expect(html).toContain("실행 중…");
    expect(html).toContain("disabled");
  });

  it("renders a completed outcome with the persona and pane", () => {
    const session: AgentSession = {
      id: "as_makise_%1",
      sessionId: "s1",
      agentId: "makise",
      role: "qa",
      backend: "tmux",
      paneId: "%1",
      status: "completed",
      createdAt: "2026-06-10T00:00:00.000Z",
    };
    const registry: SummonRegistry = { panes: [{ paneId: "%1", role: "qa", status: "free" }], sessions: [session] };
    const outcome: PersonaTaskOutcome = { ok: true, registry, session, loopStatus: "completed" };
    const html = render({ outcome });
    expect(html).toContain("완료");
    expect(html).toContain("makise");
  });

  it("renders a no_free_pane outcome", () => {
    const outcome: PersonaTaskOutcome = { ok: false, reason: "no_free_pane" };
    const html = render({ outcome });
    expect(html).toContain("비어 있는 pane이 없습니다");
  });

  it("renders an error", () => {
    const html = render({ error: "DGX-02 tmux endpoint unavailable" });
    expect(html).toContain("오류");
    expect(html).toContain("DGX-02 tmux endpoint unavailable");
  });
});
