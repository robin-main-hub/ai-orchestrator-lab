// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MissionBoardItem } from "../../lib/missionBoardModel";
import type { MissionScaffoldFile } from "../../lib/missionPublishPrefill";
import { MultiFilePlanCard } from "./MultiFilePlanCard";

/**
 * W5a: Multi-file plan card — client-side aggregation of W3a single-file plan.
 *
 * 사용자 contract:
 *   - scaffold 파일 리스트가 보이고, 안전 파일만 기본 체크.
 *   - secret/binary/large/path traversal/.github/workflows/secrets 등 위험 파일은 disabled +
 *     이유 표시.
 *   - "선택한 N개 plan" 클릭 → W3a postGithubFileChangePlan을 파일마다 호출.
 *   - 각 파일 결과(planned/blocked/failed)를 행에 표시.
 *   - 자동 실행 절대 없음(사용자 명시 클릭만).
 *   - max 10 files / 256 KiB total — 초과 시 button disabled + 오류 안내.
 *   - merge/review/label/assignee/branch delete UI 부재.
 */

afterEach(() => cleanup());

function item(missionId = "mission_mf_1"): MissionBoardItem {
  return {
    missionId,
    title: "App Builder result",
    goal: "multi-file plan",
    status: "ready_to_merge",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 0,
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-14T12:00:00.000Z",
  } as MissionBoardItem;
}

const TWO_SAFE_FILES: MissionScaffoldFile[] = [
  { path: "src/a.ts", newContent: "export const a = 1;\n", operation: "create" },
  { path: "src/b.ts", newContent: "export const b = 2;\n", operation: "create" },
];

function makeMockFetch(perFile: (body: { path: string; newContent: string }) => any) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/integrations/github/write/file/plan")) {
      return new Response(JSON.stringify(perFile(body)), { status: 200 });
    }
    return new Response(JSON.stringify({ outcome: "github_error", message: `unhandled: ${url}` }), { status: 500 });
  });
  return { fetchImpl, calls };
}

describe("MultiFilePlanCard — W5a", () => {
  it("(#1) 2개 안전 파일 → 하나의 클릭으로 W3a plan을 파일마다 1회씩 호출 + 각 행에 planned 표시", async () => {
    const { fetchImpl, calls } = makeMockFetch((body) => ({
      outcome: "planned",
      plan: {
        id: `plan_${body.path}`,
        repoFullName: "robin/lab",
        branchName: "agent/x",
        branchRef: "refs/heads/agent/x",
        path: body.path,
        operation: "create",
        newContentSha256: "sha",
        newContentLength: body.newContent.length,
        diffPreview: "--- /dev/null\n+++ b/x\n+hello\n",
        diffTruncated: false,
        diffStat: { additions: 1, deletions: 0 },
        status: "approval_required",
        truthStatus: "planned",
        createdAt: "t",
        expiresAt: "t",
      },
    }));
    const onContextEvent = vi.fn();
    render(
      <MultiFilePlanCard
        item={item()}
        files={TWO_SAFE_FILES}
        defaultRepoFullName="robin/lab"
        defaultBranchName="agent/x"
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );

    // 기본 선택 = 2/2(둘 다 안전)
    const planBtn = screen.getByTestId("publish-multifile-plan-all");
    expect(planBtn.textContent).toMatch(/선택한 2개 plan/);

    fireEvent.click(planBtn);

    await waitFor(() => {
      expect(calls.filter((c) => c.url.endsWith("/file/plan")).length).toBe(2);
    });

    // 행마다 planned 상태
    await waitFor(() => {
      const rowA = screen.getByTestId("publish-multifile-row-src/a.ts");
      expect(rowA.getAttribute("data-state")).toBe("planned");
      const rowB = screen.getByTestId("publish-multifile-row-src/b.ts");
      expect(rowB.getAttribute("data-state")).toBe("planned");
    });

    // trace 이벤트 — 요청 1회 + per-file planned 2회
    const types = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(types).toContain("github.publish.multifile.plan.requested");
    expect(types.filter((t) => t === "github.publish.multifile.plan.file.planned").length).toBe(2);
  });

  it("(#2) 시크릿 의심 파일은 disabled + skipReason 표시, 클릭해도 plan 호출에 포함 안 됨", async () => {
    const filesWithSecret: MissionScaffoldFile[] = [
      ...TWO_SAFE_FILES,
      { path: "config.env", newContent: "TOKEN=ghp_abcdefghij1234567890abcd\n", operation: "create" },
    ];
    const { fetchImpl, calls } = makeMockFetch(() => ({ outcome: "planned", plan: { id: "p", repoFullName: "r/l", branchName: "x", branchRef: "refs/heads/x", path: "p", operation: "create", newContentSha256: "s", newContentLength: 1, diffPreview: "", diffTruncated: false, diffStat: { additions: 1, deletions: 0 }, status: "approval_required", truthStatus: "planned", createdAt: "t", expiresAt: "t" } }));
    render(
      <MultiFilePlanCard
        item={item()}
        files={filesWithSecret}
        defaultRepoFullName="robin/lab"
        defaultBranchName="agent/x"
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    const evilRow = screen.getByTestId("publish-multifile-row-config.env");
    expect(evilRow.getAttribute("data-safe")).toBe("false");
    expect(evilRow.textContent).toContain("시크릿");
    // 체크박스 disabled
    const checkbox = within(evilRow).getByLabelText("include config.env") as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    // Plan 클릭 → 안전 파일 2개만 호출(시크릿은 포함 X)
    fireEvent.click(screen.getByTestId("publish-multifile-plan-all"));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/file/plan")).length).toBe(2));
  });

  it("(#3) high-risk path(.github/workflows/...)는 자동 차단 + reason 표시", () => {
    const files: MissionScaffoldFile[] = [
      { path: ".github/workflows/ci.yml", newContent: "name: ci\n", operation: "create" },
      ...TWO_SAFE_FILES,
    ];
    render(
      <MultiFilePlanCard
        item={item()}
        files={files}
        defaultRepoFullName="robin/lab"
        defaultBranchName="agent/x"
        serverBaseUrl="http://127.0.0.1:4317"
      />,
    );
    const evilRow = screen.getByTestId("publish-multifile-row-.github/workflows/ci.yml");
    expect(evilRow.getAttribute("data-safe")).toBe("false");
    expect(evilRow.textContent).toContain("high-risk path");
  });

  it("(#4) 11개 안전 파일 → 'Plan' 버튼 disabled + 한도 초과 안내", async () => {
    const tooMany: MissionScaffoldFile[] = Array.from({ length: 11 }, (_, i) => ({
      path: `src/x${i}.ts`,
      newContent: `export const v${i} = ${i};\n`,
      operation: "create",
    }));
    render(
      <MultiFilePlanCard
        item={item()}
        files={tooMany}
        defaultRepoFullName="robin/lab"
        defaultBranchName="agent/x"
        serverBaseUrl="http://127.0.0.1:4317"
      />,
    );
    const planBtn = screen.getByTestId("publish-multifile-plan-all") as HTMLButtonElement;
    expect(planBtn.disabled).toBe(true);
    expect(screen.getByTestId("publish-multifile-error").textContent).toContain("최대 10");
  });

  it("(#5) repo/branch 빈 입력이면 Plan disabled", () => {
    render(
      <MultiFilePlanCard
        item={item()}
        files={TWO_SAFE_FILES}
        defaultRepoFullName=""
        defaultBranchName=""
        serverBaseUrl="http://127.0.0.1:4317"
      />,
    );
    expect((screen.getByTestId("publish-multifile-plan-all") as HTMLButtonElement).disabled).toBe(true);
  });

  it("(#6 회귀) 위험 액션(merge/review/label/assignee/delete branch) UI 부재", () => {
    render(
      <MultiFilePlanCard
        item={item()}
        files={TWO_SAFE_FILES}
        defaultRepoFullName="robin/lab"
        defaultBranchName="agent/x"
        serverBaseUrl="http://127.0.0.1:4317"
      />,
    );
    for (const danger of [/^merge$/i, /^review$/i, /^submit review$/i, /^label/i, /^assign/i, /^delete branch/i]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
    }
  });

  it("(#7) 한 파일 blocked → 해당 행만 blocked + 나머지는 planned, plan 호출은 2회 유지", async () => {
    const { fetchImpl, calls } = makeMockFetch((body) => {
      if (body.path === "src/b.ts") {
        return { outcome: "blocked", message: "protected branch" };
      }
      return {
        outcome: "planned",
        plan: {
          id: `plan_${body.path}`,
          repoFullName: "robin/lab",
          branchName: "agent/x",
          branchRef: "refs/heads/agent/x",
          path: body.path,
          operation: "create",
          newContentSha256: "s",
          newContentLength: 1,
          diffPreview: "",
          diffTruncated: false,
          diffStat: { additions: 1, deletions: 0 },
          status: "approval_required",
          truthStatus: "planned",
          createdAt: "t",
          expiresAt: "t",
        },
      };
    });
    render(
      <MultiFilePlanCard
        item={item()}
        files={TWO_SAFE_FILES}
        defaultRepoFullName="robin/lab"
        defaultBranchName="agent/x"
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("publish-multifile-plan-all"));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/file/plan")).length).toBe(2));
    await waitFor(() => {
      expect(screen.getByTestId("publish-multifile-row-src/a.ts").getAttribute("data-state")).toBe("planned");
      expect(screen.getByTestId("publish-multifile-row-src/b.ts").getAttribute("data-state")).toBe("blocked");
    });
    expect(screen.getByTestId("publish-multifile-row-src/b.ts").textContent).toContain("protected branch");
  });
});
