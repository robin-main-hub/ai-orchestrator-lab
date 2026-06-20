import { describe, expect, it } from "vitest";
import {
  appendStep,
  createResearchSwarm,
  derivePlanProgress,
  failedAgentCount,
  finishAgent,
  markAgentRunning,
  markSwarmOffline,
  progressDots,
  progressLabel,
  settleStep,
  setViewing,
  verbForStep,
} from "./researchSwarm";

const NOW = "2026-06-10T00:00:00.000Z";

const swarm = () =>
  createResearchSwarm({
    topic: "멀티에이전트 성공 사례",
    plan: ["요원 배치", "광역 탐색", "정독·검증", "보고서 작성"],
    agents: [
      { id: "a1", personaName: "researcher", displayName: "마오마오", task: "OpenCode 생태계 검색" },
      { id: "a2", personaName: "verifier", displayName: "마키세 크리스", task: "주장 검증" },
      { id: "a3", personaName: "mediator", displayName: "니코 로빈", task: "결과 종합 노트" },
    ],
    now: NOW,
  });

describe("createResearchSwarm", () => {
  it("요원은 대기 상태, 첫 요원이 Viewing, 플랜은 전부 미체크", () => {
    const state = swarm();
    expect(state.agents.every((run) => run.status === "queued")).toBe(true);
    expect(state.viewingAgentId).toBe("a1");
    expect(state.plan.every((phase) => !phase.done)).toBe(false || state.plan.every((p) => !p.done));
    expect(progressLabel(state)).toBe("0/4");
  });
});

describe("스텝 타임라인", () => {
  it("appendStep은 동사 상태를 갱신하고 settleStep이 결과를 채운다", () => {
    let state = markAgentRunning(swarm(), "a1");
    state = appendStep(state, "a1", { id: "s1", kind: "search", title: "opencode swarm", at: NOW });
    expect(state.agents[0]!.statusVerb).toBe(verbForStep("search", 0));
    expect(state.agents[0]!.steps[0]!.status).toBe("running");

    state = settleStep(state, "a1", "s1", { output: "1. ...\n2. ...", resultCount: 22 });
    const step = state.agents[0]!.steps[0]!;
    expect(step.status).toBe("done");
    expect(step.resultCount).toBe(22);
  });

  it("진행 도트는 무비용 think를 빼고 산출 스텝(done)만 채운다", () => {
    let state = markAgentRunning(swarm(), "a1");
    // think 10개 — 진척 아님
    for (let index = 0; index < 10; index += 1) {
      state = appendStep(state, "a1", { id: `t${index}`, kind: "think", title: `t${index}`, at: NOW });
    }
    expect(progressDots(state.agents[0]!).some(Boolean)).toBe(false);
    // 완료된 search 2개 — 2칸
    state = appendStep(state, "a1", { id: "s1", kind: "search", title: "q1", at: NOW });
    state = settleStep(state, "a1", "s1", { resultCount: 5 });
    state = appendStep(state, "a1", { id: "s2", kind: "search", title: "q2", at: NOW });
    state = settleStep(state, "a1", "s2", { resultCount: 7 });
    expect(progressDots(state.agents[0]!).filter(Boolean)).toHaveLength(2);
  });
});

describe("마스터 플랜 자동 진행 (성공 증거 기반, 자기보고 비의존)", () => {
  it("착수→일부 성공→전원 종료, 실패는 진척으로 치지 않는다", () => {
    let state = swarm();
    state = derivePlanProgress(state);
    expect(progressLabel(state)).toBe("0/4");

    state = markAgentRunning(state, "a1");
    state = derivePlanProgress(state);
    expect(state.plan[0]!.done).toBe(true); // 배치 단계만
    expect(progressLabel(state)).toBe("1/4");

    state = finishAgent(state, "a1", { status: "done", conclusion: "정리" });
    state = finishAgent(state, "a2", { status: "done" });
    state = derivePlanProgress(state);
    expect(state.plan[3]!.done).toBe(false); // a3 미종료 → 보고 단계 미완

    state = finishAgent(state, "a3", { status: "done" });
    state = derivePlanProgress(state);
    expect(state.plan.every((phase) => phase.done)).toBe(true);
    expect(progressLabel(state)).toBe("4/4");
  });

  it("전원 실패/오프라인이면 보고 단계는 녹색이 되지 않는다 (서버 다운 시나리오)", () => {
    let state = markAgentRunning(swarm(), "a1");
    state = finishAgent(state, "a1", { status: "failed", error: "unreachable" });
    state = finishAgent(state, "a2", { status: "offline", error: "서버 오프라인" });
    state = finishAgent(state, "a3", { status: "offline", error: "서버 오프라인" });
    state = derivePlanProgress(state);
    expect(state.plan[state.plan.length - 1]!.done).toBe(false); // 보고 단계 미완
    expect(failedAgentCount(state)).toBe(3);
  });
});

describe("Viewing 전환", () => {
  it("setViewing이 Agent's Computer 대상 요원을 바꾼다", () => {
    const state = setViewing(swarm(), "a3");
    expect(state.viewingAgentId).toBe("a3");
  });
});

// Characterization tests (no behavior change) for the previously-unasserted reducer
// markSwarmOffline — the server-unreachable kill switch. The finishAgent block above drives
// per-agent terminal transitions, but the swarm-wide abort that flips every *in-flight*
// agent at once was never pinned. Load-bearing safety contract:
//   - ONLY queued/running agents flip to "offline" (statusVerb "오프라인", error=reason);
//   - already-terminal agents (done/failed/offline) are carried over UNTOUCHED — a prior
//     done conclusion or a failed agent's own error must NOT be overwritten by the abort
//     reason, otherwise a dead server would retroactively rewrite real outcomes;
//   - it is non-mutating (fresh state, source agents array untouched).
describe("markSwarmOffline", () => {
  it("flips only in-flight agents to offline and stamps the reason", () => {
    const reason = "서버 연결 끊김";
    const state = markSwarmOffline(markAgentRunning(swarm(), "a1"), reason);
    // a1 was running, a2/a3 were queued — all three are in-flight, so all flip
    for (const run of state.agents) {
      expect(run.status).toBe("offline");
      expect(run.statusVerb).toBe("오프라인");
      expect(run.error).toBe(reason);
    }
  });

  it("never overwrites an already-terminal agent's outcome", () => {
    let state = markAgentRunning(swarm(), "a1");
    state = finishAgent(state, "a1", { status: "done", conclusion: "정리 완료" });
    state = finishAgent(state, "a2", { status: "failed", error: "원래 실패 사유" });
    // a3 stays queued (in-flight)
    const after = markSwarmOffline(state, "서버 다운");

    const a1 = after.agents.find((run) => run.id === "a1")!;
    const a2 = after.agents.find((run) => run.id === "a2")!;
    const a3 = after.agents.find((run) => run.id === "a3")!;
    // done survives untouched — abort reason does not rewrite a real conclusion
    expect(a1.status).toBe("done");
    expect(a1.conclusion).toBe("정리 완료");
    // failed keeps its OWN error, not the abort reason
    expect(a2.status).toBe("failed");
    expect(a2.error).toBe("원래 실패 사유");
    // only the still-in-flight agent goes offline
    expect(a3.status).toBe("offline");
    expect(a3.error).toBe("서버 다운");
    expect(failedAgentCount(after)).toBe(2); // failed + offline both count
  });

  it("is non-mutating — the source state is unchanged", () => {
    const before = markAgentRunning(swarm(), "a1");
    const after = markSwarmOffline(before, "abort");
    expect(after).not.toBe(before);
    expect(before.agents.every((run) => run.status !== "offline")).toBe(true);
    expect(before.agents.find((run) => run.id === "a1")!.status).toBe("running");
  });
});
