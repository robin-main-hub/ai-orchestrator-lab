import { describe, expect, it, vi } from "vitest";
import type { GithubConnectorStatus } from "@ai-orchestrator/protocol";
import { fetchGithubConnectorStatus, githubConnectorChipLabel, resolveServerBaseUrl } from "./githubConnector";

const status = (over: Partial<GithubConnectorStatus> = {}): GithubConnectorStatus => ({
  id: "github",
  name: "GitHub (읽기 전용)",
  mode: "read_only",
  configured: false,
  tokenPresent: false,
  scopesNeeded: ["repo (read-only)"],
  note: "안내",
  ...over,
});

function jsonResponse(body: unknown, ok = true, statusCode = 200): Response {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

describe("resolveServerBaseUrl", () => {
  it("배열에서 첫 유효 URL, 없으면 undefined", () => {
    expect(resolveServerBaseUrl(["", "  ", "http://x"])).toBe("http://x");
    expect(resolveServerBaseUrl(undefined)).toBeUndefined();
    expect(resolveServerBaseUrl("  ")).toBeUndefined();
  });
});

describe("fetchGithubConnectorStatus", () => {
  it("서버 주소 없으면 unknown (GitHub 호출 안 함)", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchGithubConnectorStatus(undefined, fetchImpl as unknown as typeof fetch)).toEqual({ state: "unknown" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("정상 응답이면 ready + status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: status({ configured: true, tokenPresent: true }) }));
    const view = await fetchGithubConnectorStatus("http://x", fetchImpl as unknown as typeof fetch);
    expect(view).toEqual({ state: "ready", status: status({ configured: true, tokenPresent: true }) });
  });

  it("네트워크 오류면 error(메시지 보존, 던지지 않음)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchGithubConnectorStatus("http://x", fetchImpl as unknown as typeof fetch)).toEqual({ state: "error", message: "offline" });
  });
});

describe("githubConnectorChipLabel — 정직 라벨", () => {
  it("미연결/미설정/연결됨/오류를 구분", () => {
    expect(githubConnectorChipLabel({ state: "unknown" }).text).toContain("서버 미연결");
    expect(githubConnectorChipLabel({ state: "error", message: "x" }).tone).toBe("error");
    expect(githubConnectorChipLabel({ state: "ready", status: status({ configured: false }) }).text).toContain("미설정");
    const connected = githubConnectorChipLabel({ state: "ready", status: status({ configured: true, tokenPresent: true }) });
    expect(connected.text).toContain("연결됨");
    expect(connected.tone).toBe("configured");
  });
});
