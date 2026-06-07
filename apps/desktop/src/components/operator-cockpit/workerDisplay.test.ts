import { describe, expect, it } from "vitest";
import {
  formatOperatorWorktreeLabel,
  resolveOperatorWorkerDisplay,
  resolveOperatorWorkerSkillDisplay,
} from "./workerDisplay";

describe("resolveOperatorWorkerDisplay", () => {
  it("maps seeded agent worker ids to Korean persona display names", () => {
    expect(resolveOperatorWorkerDisplay({ role: "orchestrator", workerId: "agent_orchestrator" })).toMatchObject({
      displayName: "마키마",
      portraitAgentId: "orchestrator",
      roleLabel: "지휘자 · 기본 역할",
    });

    expect(resolveOperatorWorkerDisplay({ role: "reviewer", workerId: "agent_reviewer" })).toMatchObject({
      displayName: "시노미야 카구야",
      portraitAgentId: "reviewer",
      roleLabel: "검토자 · 기본 역할",
    });
  });

  it("preserves persona-specific role labels for special skeptic agents", () => {
    expect(resolveOperatorWorkerDisplay({ role: "skeptic", workerId: "agent_skeptic" })).toMatchObject({
      displayName: "소류 아스카 랭그레이",
      portraitAgentId: "skeptic",
      roleLabel: "비판자 · UX 비판자",
    });

    expect(resolveOperatorWorkerDisplay({ role: "skeptic", workerId: "agent_skeptic_yohane" })).toMatchObject({
      displayName: "츠시마 요시코",
      portraitAgentId: "yohane",
      roleLabel: "비판자 · 4차원 아이디어 뱅크",
    });
  });

  it("falls back through role persona when the worker id is unknown", () => {
    expect(resolveOperatorWorkerDisplay({ role: "builder", workerId: "temporary_worker" })).toMatchObject({
      displayName: "히라사와 유이",
      portraitAgentId: "builder",
      roleLabel: "구현자 · 기본 역할",
    });
  });

  it("exposes role skill chips for cockpit worker rows", () => {
    expect(resolveOperatorWorkerSkillDisplay("orchestrator")).toEqual({
      boundaryLabel: "승인 필요 1개",
      label: "지휘 도구",
      tools: ["작업 대기열", "승인 확인", "터미널 계획"],
    });

    expect(resolveOperatorWorkerSkillDisplay("verifier")).toEqual({
      boundaryLabel: "승인 필요 1개",
      label: "검증 도구",
      tools: ["테스트 확인", "빌드 확인", "근거 확인"],
    });
  });

  it("worker worktree 전체 경로를 메인 카드용 짧은 작업공간 라벨로 줄인다", () => {
    expect(formatOperatorWorktreeLabel("/Users/robin/.config/superpowers/worktrees/project/feature-big-rock")).toBe(
      "작업공간 feature-big-rock",
    );
    expect(formatOperatorWorktreeLabel("")).toBe("작업공간 대기");
  });
});
