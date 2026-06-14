import { describe, expect, it, vi } from "vitest";
import {
  buildTurboEditCompletionRequest,
  createTurboEditGenerator,
  parseTurboEditGeneratorResponse,
} from "./turboEditGenerator";
import type { ProviderCompletionRequest, ProviderCompletionResponse } from "@ai-orchestrator/protocol";

type RequestCompletion = (
  request: ProviderCompletionRequest,
  opts?: { serverBaseUrl?: string | string[]; fetchImpl?: typeof fetch },
) => Promise<ProviderCompletionResponse>;

function ok(content: string, overrides?: Partial<ProviderCompletionResponse>): ProviderCompletionResponse {
  return {
    id: "resp_x",
    status: "succeeded" as const,
    content,
    receivedAt: "2026-06-15T00:00:00Z",
    ...overrides,
  } as unknown as ProviderCompletionResponse;
}

function fail(
  error: string,
  status: ProviderCompletionResponse["status"] = "failed",
): ProviderCompletionResponse {
  return {
    id: "resp_x",
    status,
    error,
    receivedAt: "2026-06-15T00:00:00Z",
  } as unknown as ProviderCompletionResponse;
}

describe("buildTurboEditCompletionRequest", () => {
  it("(B1) ProviderCompletionRequest 모양 — messages=system+user, route=server_proxy, source=desktop", () => {
    const req = buildTurboEditCompletionRequest({
      systemPrompt: "S",
      userPrompt: "U",
      providerProfileId: "anthropic_main",
      modelId: "claude-x",
      missionId: "m1",
      requestId: "creq_test_1",
      createdAt: "2026-06-15T00:00:00Z",
    });
    expect(req.id).toBe("creq_test_1");
    expect(req.sessionId).toBe("mission_turbo_edits_m1");
    expect(req.providerProfileId).toBe("anthropic_main");
    expect(req.modelId).toBe("claude-x");
    expect(req.messages).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "U" },
    ]);
    expect(req.source).toBe("desktop");
    expect(req.routePreference).toBe("server_proxy");
    expect(req.requestContext).toEqual({ userId: "owner", routeType: "personal", humanInitiated: true });
    expect(req.maxOutputTokens).toBe(8192);
  });

  it("(B2) maxOutputTokens override 가능", () => {
    const req = buildTurboEditCompletionRequest({
      systemPrompt: "S",
      userPrompt: "U",
      providerProfileId: "p",
      modelId: "m",
      missionId: "m",
      requestId: "r",
      createdAt: "t",
      maxOutputTokens: 2048,
    });
    expect(req.maxOutputTokens).toBe(2048);
  });
});

describe("parseTurboEditGeneratorResponse", () => {
  it("(R1) succeeded + content 있음 → ok=true + text trim", () => {
    expect(parseTurboEditGeneratorResponse(ok("  hello\n"))).toEqual({ ok: true, text: "hello" });
  });

  it("(R2) succeeded지만 content 비어 있음 → ok=false + 사람용 사유", () => {
    expect(parseTurboEditGeneratorResponse(ok(""))).toEqual({
      ok: false,
      reason: "응답 본문이 비어 있음",
    });
  });

  it("(R3) failed 상태 → ok=false + 서버 error 메시지 그대로", () => {
    expect(parseTurboEditGeneratorResponse(fail("rate_limit"))).toEqual({
      ok: false,
      reason: "rate_limit",
    });
  });

  it("(R4) failed인데 error 없음 → 상태값 fallback 노출", () => {
    expect(parseTurboEditGeneratorResponse(fail("", "failed"))).toEqual({
      ok: false,
      reason: "provider 응답 상태=failed",
    });
  });
});

describe("createTurboEditGenerator", () => {
  it("(G1) 정상: requestCompletion이 succeeded 응답 → ok=true + text 반환", async () => {
    const requestCompletion = vi.fn<RequestCompletion>(async () =>
      ok("src/a.ts\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE\n"),
    );
    const gen = createTurboEditGenerator({
      providerProfileId: "p",
      modelId: "m",
      missionId: "m1",
      requestCompletion,
      newRequestId: () => "creq_test_2",
      now: () => "2026-06-15T01:00:00Z",
    });
    const res = await gen({ systemPrompt: "S", userPrompt: "U" });
    expect(res).toEqual({
      ok: true,
      text: "src/a.ts\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE",
    });
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    const sent = requestCompletion.mock.calls[0]![0]!;
    expect(sent.providerProfileId).toBe("p");
    expect(sent.modelId).toBe("m");
    expect(sent.messages[1]?.content).toBe("U");
    expect(sent.id).toBe("creq_test_2");
    expect(sent.createdAt).toBe("2026-06-15T01:00:00Z");
  });

  it("(G2) requestCompletion throw → ok=false + Error.message 그대로(가짜 성공 X)", async () => {
    const requestCompletion = vi.fn<RequestCompletion>(async () => {
      throw new Error("network down");
    });
    const gen = createTurboEditGenerator({
      providerProfileId: "p",
      modelId: "m",
      missionId: "m1",
      requestCompletion,
    });
    const res = await gen({ systemPrompt: "S", userPrompt: "U" });
    expect(res).toEqual({ ok: false, reason: "network down" });
  });

  it("(G3) succeeded지만 content 비어 있음 → ok=false + '응답 본문이 비어 있음'", async () => {
    const requestCompletion = vi.fn<RequestCompletion>(async () => ok(""));
    const gen = createTurboEditGenerator({
      providerProfileId: "p",
      modelId: "m",
      missionId: "m1",
      requestCompletion,
    });
    const res = await gen({ systemPrompt: "S", userPrompt: "U" });
    expect(res).toEqual({ ok: false, reason: "응답 본문이 비어 있음" });
  });
});
