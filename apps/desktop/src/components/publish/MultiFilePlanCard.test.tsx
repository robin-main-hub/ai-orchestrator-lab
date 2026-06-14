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

function makeMockFetch(
  perFile: (body: { path: string; newContent: string }) => any,
  executeResponse?: (body: any) => any,
) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/integrations/github/write/file/plan")) {
      return new Response(JSON.stringify(perFile(body)), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/multifile/commit/execute")) {
      return new Response(
        JSON.stringify(executeResponse ? executeResponse(body) : { outcome: "failed", message: "no executeResponse" }),
        { status: 200 },
      );
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

  it("(#W5b-1) plan 2개 완료 후 expectedHeadSha+message+approvalId 입력하면 Execute 활성화 → 클릭 시 atomic commit 호출 + observed UI", async () => {
    const PLANNED_OK = (path: string) => ({
      outcome: "planned" as const,
      plan: {
        id: `plan_${path}`,
        repoFullName: "robin/lab",
        branchName: "agent/x",
        branchRef: "refs/heads/agent/x",
        path,
        operation: "create" as const,
        newContentSha256: "s",
        newContentLength: 1,
        diffPreview: "",
        diffTruncated: false,
        diffStat: { additions: 1, deletions: 0 },
        status: "approval_required" as const,
        truthStatus: "planned" as const,
        createdAt: "t",
        expiresAt: "t",
      },
    });
    const { fetchImpl, calls } = makeMockFetch(
      (body) => PLANNED_OK(body.path),
      () => ({
        outcome: "observed",
        commitSha: "abcdef1234567890abcdef1234567890abcdef12",
        htmlUrl: "https://github.com/robin/lab/commit/abcdef1",
        fileCount: 2,
      }),
    );
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

    // 처음엔 execute disabled (plan 미완료)
    const executeBtn = () => screen.getByTestId("publish-multifile-execute") as HTMLButtonElement;
    expect(executeBtn().disabled).toBe(true);

    // Plan 진행
    fireEvent.click(screen.getByTestId("publish-multifile-plan-all"));
    await waitFor(() => {
      expect(screen.getByTestId("publish-multifile-row-src/a.ts").getAttribute("data-state")).toBe("planned");
      expect(screen.getByTestId("publish-multifile-row-src/b.ts").getAttribute("data-state")).toBe("planned");
    });

    // 입력 전이면 여전히 disabled
    expect(executeBtn().disabled).toBe(true);

    // expectedHeadSha + message + approvalId 입력
    fireEvent.change(screen.getByLabelText("multifile expectedHeadSha"), {
      target: { value: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
    });
    fireEvent.change(screen.getByLabelText("multifile commit message"), {
      target: { value: "scaffold: 2 files" },
    });
    fireEvent.change(screen.getByLabelText("multifile approval ID"), {
      target: { value: "appr-xyz" },
    });
    await waitFor(() => expect(executeBtn().disabled).toBe(false));

    // Execute 클릭
    fireEvent.click(executeBtn());
    await waitFor(() => {
      const executeCalls = calls.filter((c) =>
        c.url.endsWith("/integrations/github/write/multifile/commit/execute"),
      );
      expect(executeCalls.length).toBe(1);
      // request body 형태
      expect(executeCalls[0]!.body.repoFullName).toBe("robin/lab");
      expect(executeCalls[0]!.body.branchName).toBe("agent/x");
      expect(executeCalls[0]!.body.expectedHeadSha).toBe(
        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      );
      expect(executeCalls[0]!.body.approvalId).toBe("appr-xyz");
      expect(executeCalls[0]!.body.files.length).toBe(2);
      expect(executeCalls[0]!.body.files[0].path).toBe("src/a.ts");
    });

    // observed UI
    await waitFor(() => {
      const observed = screen.getByTestId("publish-multifile-execute-observed");
      expect(observed.textContent).toContain("abcdef1");
      expect(observed.textContent).toContain("2개 파일 적용");
      expect(screen.getByTestId("publish-multifile-execute-link")).toHaveProperty(
        "href",
        "https://github.com/robin/lab/commit/abcdef1",
      );
    });

    // trace
    const types = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(types).toContain("github.publish.multifile.commit.requested");
    expect(types).toContain("github.publish.multifile.commit.observed");
    // raw content 누설 X — trace payload에 newContent가 들어가지 않아야 함
    const observedTrace = onContextEvent.mock.calls.find(
      (c) => c[0] === "github.publish.multifile.commit.observed",
    );
    expect(JSON.stringify(observedTrace?.[1])).not.toContain("export const");
  });

  it("(#W5b-2) head_mismatch 응답 → amber 경고 + blocked trace(reason=head_mismatch)", async () => {
    const PLANNED_OK = (path: string) => ({
      outcome: "planned" as const,
      plan: {
        id: `plan_${path}`,
        repoFullName: "robin/lab",
        branchName: "agent/x",
        branchRef: "refs/heads/agent/x",
        path,
        operation: "create" as const,
        newContentSha256: "s",
        newContentLength: 1,
        diffPreview: "",
        diffTruncated: false,
        diffStat: { additions: 1, deletions: 0 },
        status: "approval_required" as const,
        truthStatus: "planned" as const,
        createdAt: "t",
        expiresAt: "t",
      },
    });
    const { fetchImpl } = makeMockFetch(
      (body) => PLANNED_OK(body.path),
      () => ({
        outcome: "head_mismatch",
        message: "branch HEAD가 변경됨 (expected != actual)",
      }),
    );
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

    fireEvent.click(screen.getByTestId("publish-multifile-plan-all"));
    await waitFor(() =>
      expect(screen.getByTestId("publish-multifile-row-src/b.ts").getAttribute("data-state")).toBe(
        "planned",
      ),
    );
    fireEvent.change(screen.getByLabelText("multifile expectedHeadSha"), {
      target: { value: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
    });
    fireEvent.change(screen.getByLabelText("multifile commit message"), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByLabelText("multifile approval ID"), {
      target: { value: "a" },
    });
    fireEvent.click(screen.getByTestId("publish-multifile-execute"));

    await waitFor(() => {
      const warn = screen.getByTestId("publish-multifile-execute-head-mismatch");
      expect(warn.textContent).toContain("branch head가 변경됨");
    });
    const blockedTrace = onContextEvent.mock.calls.find(
      (c) => c[0] === "github.publish.multifile.commit.blocked",
    );
    expect(blockedTrace).toBeTruthy();
    expect((blockedTrace?.[1] as any).reason).toBe("head_mismatch");
  });

  it("(#W5b-3) 잘못된 expectedHeadSha (40-hex 아님)이면 execute disabled 유지", async () => {
    const PLANNED_OK = (path: string) => ({
      outcome: "planned" as const,
      plan: {
        id: `plan_${path}`,
        repoFullName: "robin/lab",
        branchName: "agent/x",
        branchRef: "refs/heads/agent/x",
        path,
        operation: "create" as const,
        newContentSha256: "s",
        newContentLength: 1,
        diffPreview: "",
        diffTruncated: false,
        diffStat: { additions: 1, deletions: 0 },
        status: "approval_required" as const,
        truthStatus: "planned" as const,
        createdAt: "t",
        expiresAt: "t",
      },
    });
    const { fetchImpl } = makeMockFetch((body) => PLANNED_OK(body.path));
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
    await waitFor(() =>
      expect(screen.getByTestId("publish-multifile-row-src/b.ts").getAttribute("data-state")).toBe(
        "planned",
      ),
    );
    fireEvent.change(screen.getByLabelText("multifile expectedHeadSha"), {
      target: { value: "not-a-sha" },
    });
    fireEvent.change(screen.getByLabelText("multifile commit message"), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByLabelText("multifile approval ID"), {
      target: { value: "a" },
    });
    expect((screen.getByTestId("publish-multifile-execute") as HTMLButtonElement).disabled).toBe(
      true,
    );
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
