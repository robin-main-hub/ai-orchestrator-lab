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
      personaOptions={props.personaOptions}
      steps={props.steps}
      history={props.history}
      roster={props.roster}
      notice={props.notice}
      personaAvatars={props.personaAvatars}
      personaSprites={props.personaSprites}
      expression={props.expression}
      onFieldChange={noop}
      onRun={noop}
      onLoadFromPacket={props.onLoadFromPacket}
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

  it("shows the load-from-packet button only when the handler is provided", () => {
    expect(render({ onLoadFromPacket: () => {} })).toContain("패킷 불러오기");
    expect(render()).not.toContain("패킷 불러오기");
  });

  it("shows the persona avatar when the typed persona has one", () => {
    const html = render({
      form: form({ personaName: "makima" }),
      personaAvatars: { makima: "/assets/makima.png" },
    });
    expect(html).toContain("autonomy-persona-avatar");
    expect(html).toContain("/assets/makima.png");
  });

  it("falls back to the bot icon when the persona has no avatar", () => {
    const html = render({ form: form({ personaName: "architect" }), personaAvatars: { makima: "/x.png" } });
    expect(html).not.toContain("autonomy-persona-avatar");
  });

  it("shows the expression sprite for the current emotion, with neutral fallback", () => {
    const sprites = { makima: { neutral: "/n.png", pride: "/pride.png" } };
    const proud = render({ form: form({ personaName: "makima" }), personaSprites: sprites, expression: "pride" });
    expect(proud).toContain("/pride.png");
    expect(proud).toContain("표정: pride");
    const noSprite = render({ form: form({ personaName: "makima" }), personaSprites: sprites, expression: "anger" });
    expect(noSprite).toContain("/n.png"); // anger missing -> neutral sprite
  });

  it("renders the pane roster when present", () => {
    const html = render({
      roster: {
        rows: [
          { paneId: "%1", role: "code", busy: true, agentId: "makise" },
          { paneId: "%2", role: "qa", busy: false },
        ],
        busyCount: 1,
        freeCount: 1,
      },
    });
    expect(html).toContain("pane 로스터");
    expect(html).toContain("makise 점유");
    expect(html).toContain("비어 있음");
  });

  it("renders the run history when present", () => {
    const html = render({
      history: [
        { runId: "r1", personaName: "makise", role: "qa", goal: "fix bug", stepCount: 2, status: "completed" },
      ],
    });
    expect(html).toContain("실행 기록");
    expect(html).toContain("makise");
    expect(html).toContain("fix bug");
    expect(html).toContain("완료");
  });

  it("renders the mission HUD classes and the auth-required alarm on escalation", () => {
    const html = render({
      steps: [
        { step: 1, outcome: "completed", action: "dispatch_next", reason: "go" },
        { step: 2, outcome: "blocked", action: "escalate_approval", reason: "blocked" },
      ],
    });
    expect(html).toContain("autonomy-hud");
    expect(html).toContain("hud-escalate_approval");
    expect(html).toContain("autonomy-hud-alarm");
    expect(html).toContain("auth required");
  });

  it("renders the iteration timeline when steps are present", () => {
    const html = render({
      steps: [
        { step: 1, outcome: "completed", action: "dispatch_next", reason: "step completed" },
        { step: 2, outcome: "blocked", action: "escalate_approval", reason: "worker is blocked" },
      ],
    });
    expect(html).toContain("다음 단계 전송");
    expect(html).toContain("사람에게 에스컬레이트");
    expect(html).toContain("worker is blocked");
    expect(html).toContain("#2");
  });
});
