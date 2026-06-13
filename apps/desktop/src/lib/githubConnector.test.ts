import { describe, expect, it, vi } from "vitest";
import type { GithubConnectorStatus } from "@ai-orchestrator/protocol";
import {
  fetchGithubConnectorStatus,
  fetchGithubPullRequest,
  fetchGithubPullRequests,
  githubConnectorChipLabel,
  githubOutcomeLabel,
  resolveServerBaseUrl,
} from "./githubConnector";

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

describe("fetchGithubPullRequests / fetchGithubPullRequest — 판별 결과", () => {
  it("서버 주소 없으면 connection_failed (fetch 안 함)", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchGithubPullRequests(undefined, "o", "r", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("connection_failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("observed면 data를 싣는다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        outcome: "observed",
        observedAt: "2026-06-13T00:00:00.000Z",
        pullRequests: [{ number: 1, title: "t", state: "open", author: "a", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u" }],
      }),
    );
    const result = await fetchGithubPullRequests("http://x", "o", "r", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("observed");
    expect(result.data).toHaveLength(1);
    expect(result.observedAt).toBe("2026-06-13T00:00:00.000Z");
  });

  it("서버가 permission_denied면 그대로 전달(빈 배열로 위장 안 함)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ outcome: "permission_denied", message: "권한 부족" }));
    const result = await fetchGithubPullRequests("http://x", "o", "r", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("permission_denied");
    expect(result.data).toBeUndefined();
    expect(result.message).toContain("권한");
  });

  it("우리 서버 네트워크 실패는 connection_failed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("server down");
    });
    const result = await fetchGithubPullRequest("http://x", "o", "r", 1, fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("connection_failed");
  });

  it("PR 상세 observed면 pullRequest를 싣는다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ outcome: "observed", pullRequest: { number: 5, title: "x" } }));
    const result = await fetchGithubPullRequest("http://x", "o", "r", 5, fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("observed");
    expect(result.data?.number).toBe(5);
  });
});

describe("githubOutcomeLabel", () => {
  it("outcome을 정직한 라벨/변형으로 매핑", () => {
    expect(githubOutcomeLabel("observed")).toEqual({ text: "관측됨", variant: "success" });
    expect(githubOutcomeLabel("not_configured").text).toBe("미설정");
    expect(githubOutcomeLabel("permission_denied").text).toBe("권한 부족");
    expect(githubOutcomeLabel("connection_failed")).toEqual({ text: "연결 실패", variant: "danger" });
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
