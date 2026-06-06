import { describe, expect, it } from "vitest";
import {
  resolveOperatorWorkerDisplay,
  resolveOperatorWorkerSkillDisplay,
} from "./workerDisplay";

describe("resolveOperatorWorkerDisplay", () => {
  it("maps seeded agent worker ids to Korean persona display names", () => {
    expect(resolveOperatorWorkerDisplay({ role: "orchestrator", workerId: "agent_orchestrator" })).toMatchObject({
      displayName: "마키마",
      portraitAgentId: "orchestrator",
      roleLabel: "Orchestrator · 지휘자",
    });

    expect(resolveOperatorWorkerDisplay({ role: "reviewer", workerId: "agent_reviewer" })).toMatchObject({
      displayName: "시노미야 카구야",
      portraitAgentId: "reviewer",
      roleLabel: "Reviewer · 검토자",
    });
  });

  it("preserves persona-specific role labels for special skeptic agents", () => {
    expect(resolveOperatorWorkerDisplay({ role: "skeptic", workerId: "agent_skeptic" })).toMatchObject({
      displayName: "소류 아스카 랭그레이",
      portraitAgentId: "skeptic",
      roleLabel: "Skeptic · UX 비판자",
    });

    expect(resolveOperatorWorkerDisplay({ role: "skeptic", workerId: "agent_skeptic_yohane" })).toMatchObject({
      displayName: "츠시마 요시코",
      portraitAgentId: "yohane",
      roleLabel: "Skeptic · 4차원 아이디어 뱅크",
    });
  });

  it("falls back through role persona when the worker id is unknown", () => {
    expect(resolveOperatorWorkerDisplay({ role: "builder", workerId: "temporary_worker" })).toMatchObject({
      displayName: "히라사와 유이",
      portraitAgentId: "builder",
      roleLabel: "Builder · 구현자",
    });
  });

  it("exposes role skill chips for cockpit worker rows", () => {
    expect(resolveOperatorWorkerSkillDisplay("orchestrator")).toEqual({
      boundaryLabel: "승인 필요 1개",
      label: "지휘 도구",
      tools: ["작업 대기열", "승인 확인", "Tmux 계획"],
    });

    expect(resolveOperatorWorkerSkillDisplay("verifier")).toEqual({
      boundaryLabel: "승인 필요 1개",
      label: "검증 도구",
      tools: ["테스트 확인", "빌드 확인", "근거 확인"],
    });
  });
});
