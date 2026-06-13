import type { IncomingMessage } from "node:http";
import type { DesignBlueprintInput } from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import type { MissionStore } from "../missions/missionStore.js";
import { handleMissionRoute } from "./missions.js";

// blueprint-draft 엔드포인트는 store를 건드리지 않는다(초안만 생성) — 빈 store로 충분.
const emptyStore = { list: async () => [], get: async () => null } as unknown as MissionStore;

function deps(body: unknown, extra: Record<string, unknown> = {}) {
  let status = 0;
  let payload: unknown = null;
  return {
    args: {
      store: emptyStore,
      request: {} as IncomingMessage,
      pathname: "/missions/blueprint-draft",
      method: "POST",
      readJsonBody: async () => body,
      isRequestBodyTooLargeError: (_e: unknown): _e is { limit: number } => false,
      respondJson: (code: number, body2: unknown) => {
        status = code;
        payload = body2;
      },
      ...extra,
    },
    result: () => ({ status, payload: payload as { blueprint: DesignBlueprintInput; source: string; degraded: boolean; note?: string } }),
  };
}

const aiBlueprint: DesignBlueprintInput = {
  title: "AI가 보강한 칸반",
  userIntent: "할 일을 컬럼으로 관리",
  targetSurface: "new_app",
  screens: [
    { name: "보드", purpose: "칸반 컬럼", primaryAction: "카드 추가", secondaryActions: ["필터"], dataNeeded: ["카드"], emptyState: "카드 없음", errorState: "로드 실패" },
    { name: "설정", purpose: "컬럼 편집", primaryAction: "컬럼 추가", secondaryActions: [], dataNeeded: [], emptyState: "없음", errorState: "실패" },
  ],
  designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  acceptanceCriteria: ["드래그로 카드 이동"],
};

const convo = { messages: [{ role: "user", content: "칸반 앱 만들어줘" }], sessionId: "session_1" };

describe("POST /missions/blueprint-draft (3순위 — A+B)", () => {
  it("returns the deterministic stub when AI is not requested (source:stub, not degraded)", async () => {
    const enrichBlueprintWithAi = vi.fn();
    const { args, result } = deps(convo, { enrichBlueprintWithAi });
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200);
    expect(payload.source).toBe("stub");
    expect(payload.degraded).toBe(false);
    expect(payload.blueprint.screens).toHaveLength(1); // stub은 화면 1개(관측 안 한 화면 안 지어냄)
    expect(payload.blueprint.title).toBe("칸반 앱 만들어줘");
    expect(enrichBlueprintWithAi).not.toHaveBeenCalled(); // AI 호출 안 함
  });

  it("returns the AI blueprint when enrich succeeds (source:ai, not degraded)", async () => {
    const enrichBlueprintWithAi = vi.fn(async () => aiBlueprint);
    const { args, result } = deps(
      { ...convo, useAi: true, providerProfileId: "p1", modelId: "m1" },
      { enrichBlueprintWithAi },
    );
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200);
    expect(payload.source).toBe("ai");
    expect(payload.degraded).toBe(false);
    expect(payload.blueprint.screens).toHaveLength(2);
    expect(enrichBlueprintWithAi).toHaveBeenCalledOnce(); // 정확히 1콜(4~16 발사 아님)
  });

  it("FALLBACK: AI returns null → 200 with the deterministic stub, degraded:true (not 5xx)", async () => {
    const enrichBlueprintWithAi = vi.fn(async () => null);
    const { args, result } = deps(
      { ...convo, useAi: true, providerProfileId: "p1", modelId: "m1" },
      { enrichBlueprintWithAi },
    );
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200); // 실패해도 패널은 쓸 수 있는 초안을 받는다
    expect(payload.source).toBe("stub");
    expect(payload.degraded).toBe(true);
    expect(payload.note).toMatch(/AI/);
    expect(payload.blueprint.screens).toHaveLength(1);
  });

  it("FALLBACK: AI throws → 200 with the stub, degraded:true (exception swallowed)", async () => {
    const enrichBlueprintWithAi = vi.fn(async () => {
      throw new Error("provider down");
    });
    const { args, result } = deps(
      { ...convo, useAi: true, providerProfileId: "p1", modelId: "m1" },
      { enrichBlueprintWithAi },
    );
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200);
    expect(payload.source).toBe("stub");
    expect(payload.degraded).toBe(true);
  });

  it("useAi requested but no provider/model → stub with degraded:true (정직: AI 미가용)", async () => {
    const enrichBlueprintWithAi = vi.fn();
    const { args, result } = deps({ ...convo, useAi: true }, { enrichBlueprintWithAi });
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200);
    expect(payload.source).toBe("stub");
    expect(payload.degraded).toBe(true);
    expect(enrichBlueprintWithAi).not.toHaveBeenCalled(); // provider/model 없으면 시도조차 안 함
  });

  it("400 on an invalid payload (no messages)", async () => {
    const { args, result } = deps({ sessionId: "s1" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(400);
  });
});
