// @vitest-environment jsdom
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MissionBoardItem } from "../lib/missionBoardModel";
import type { MissionScaffoldLatestResponse } from "@ai-orchestrator/protocol";
import type { MissionPublishEnvironment } from "./MissionBoardPanel";

/**
 * App Build → Revision → Scaffold Refresh → Publish Prefill 갱신 smoke.
 *
 * 시나리오(사용자 흐름):
 *   1) 사용자가 mission 펼침 → Container가 첫 scaffold/latest 호출 → file prefill v=1.
 *   2) BlueprintReviewCard에서 "수정안 적용" → "수정안으로 스캐폴드 다시 생성" 클릭(시뮬레이션).
 *   3) 부모(App.tsx 대역)가 refreshScaffoldHandleRef.current(missionId)를 호출.
 *   4) Container의 캐시 invalidate → useEffect가 두 번째 scaffold/latest 호출.
 *   5) Publish Panel file prefill이 새 응답(v=2 revised)으로 갱신.
 *
 * 회귀 가드:
 *   - GitHub write route 0회.
 *   - Mission mutation(create/verify/merge/append-event) 0회.
 *   - merge/review/label/assignee/branch delete UI 부재.
 */

/* eslint-disable react-hooks/rules-of-hooks */
const mocks = vi.hoisted(() => ({
  fetchDgxMissions: vi.fn(),
  fetchMissionScaffoldLatest: vi.fn(),
  createDgxMission: vi.fn(),
  mergeDgxMission: vi.fn(),
  verifyDgxMission: vi.fn(),
  appendDgxMissionEvent: vi.fn(),
}));
/* eslint-enable react-hooks/rules-of-hooks */

vi.mock("../runtime/stage47MissionServer", () => ({
  fetchDgxMissions: mocks.fetchDgxMissions,
  fetchMissionScaffoldLatest: mocks.fetchMissionScaffoldLatest,
  createDgxMission: mocks.createDgxMission,
  mergeDgxMission: mocks.mergeDgxMission,
  verifyDgxMission: mocks.verifyDgxMission,
  appendDgxMissionEvent: mocks.appendDgxMissionEvent,
}));

import { MissionBoardContainer } from "./MissionBoardContainer";

const MISSION_ID = "mission_scaffold_refresh_1";

function localMissionItem(): MissionBoardItem {
  return {
    missionId: MISSION_ID,
    title: "App Builder result — todo app",
    goal: "scaffold refresh smoke",
    status: "ready_to_merge",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 1,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_refresh",
      name: "robin/lab",
      appType: "web",
      previewStatus: "running",
      previewUrl: "http://localhost:5173",
      previewTruth: "observed",
    },
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-14T12:00:00.000Z",
  } as MissionBoardItem;
}

function scaffoldResponse(content: string, planId: string): MissionScaffoldLatestResponse {
  return {
    missionId: MISSION_ID,
    status: "found",
    truthStatus: "planned",
    planId,
    files: [
      {
        path: "src/util.ts",
        content,
        source: "scaffold_plan",
        createdAt: "2026-06-14T12:00:00.000Z",
      },
    ],
    skipped: [],
  };
}

function makeBlockedFetchImpl() {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return new Response(JSON.stringify({ outcome: "github_error" }), { status: 500 });
  });
  return { fetchImpl, calls };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetchDgxMissions.mockResolvedValue({ missions: [] });
});

afterEach(() => cleanup());

describe("MissionBoardContainer — scaffold refresh round-trip", () => {
  it("refreshScaffoldHandleRef.current(missionId) → 캐시 invalidate → 새 scaffold로 file prefill 갱신", async () => {
    // 1차/2차 응답을 mockResolvedValueOnce로 순차 주입.
    mocks.fetchMissionScaffoldLatest
      .mockResolvedValueOnce(scaffoldResponse("export const v = 1;\n", "plan_v1"))
      .mockResolvedValueOnce(scaffoldResponse("export const v = 2; // revised\n", "plan_v2"));

    const { fetchImpl } = makeBlockedFetchImpl();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    // 부모가 보유할 ref — Container가 등록한다(internal default refresh).
    function Harness() {
      const refreshRef = useRef<((missionId: string) => void) | null>(null);
      return (
        <>
          <MissionBoardContainer
            serverBaseUrl="http://127.0.0.1:4317"
            localItems={[localMissionItem()]}
            publishEnvironment={publishEnvironment}
            refreshScaffoldHandleRef={refreshRef}
          />
          {/* 테스트 트리거 — 사용자가 BlueprintReviewCard의 "스캐폴드 다시 생성"을 누른 것과
              동일한 효과(refreshRef.current(missionId) 호출). */}
          <button
            type="button"
            data-testid="external-refresh-trigger"
            onClick={() => refreshRef.current?.(MISSION_ID)}
          >
            external refresh
          </button>
        </>
      );
    }

    render(<Harness />);

    // 2) 미션 펼치기 → 첫 fetch 호출, file prefill = v=1
    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = await screen.findByTestId("github-publish-panel");
    const fileSection = within(panel).getByTestId("publish-step-file");
    await waitFor(() => {
      expect(
        (within(fileSection).getByLabelText("file new content") as HTMLTextAreaElement).value,
      ).toBe("export const v = 1;\n");
    });

    // 3) Panel을 닫음(GithubPublishPanel은 useState(initial)로만 초기값을 받으므로,
    //    refresh 후 새 prefill을 보려면 panel을 다시 마운트해야 한다 — 실제 UX와도 일치).
    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    await waitFor(() => expect(screen.queryByTestId("github-publish-panel")).toBeNull());

    // 4) 외부 refresh trigger 클릭 → ref 통해 캐시 invalidate → useEffect 재조회
    fireEvent.click(screen.getByTestId("external-refresh-trigger"));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledTimes(2));

    // 5) Panel을 다시 열어 새 prefill 확인
    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel2 = await screen.findByTestId("github-publish-panel");
    const fileSection2 = within(panel2).getByTestId("publish-step-file");
    await waitFor(() => {
      expect(
        (within(fileSection2).getByLabelText("file new content") as HTMLTextAreaElement).value,
      ).toBe("export const v = 2; // revised\n");
    });

    // 5) 회귀 가드: 전체 흐름에서 GitHub write fetch 0회 + Mission mutation 0회.
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.createDgxMission).not.toHaveBeenCalled();
    expect(mocks.verifyDgxMission).not.toHaveBeenCalled();
    expect(mocks.mergeDgxMission).not.toHaveBeenCalled();
    expect(mocks.appendDgxMissionEvent).not.toHaveBeenCalled();

    // 6) 위험 액션 UI 부재(W1~W4 contract 회귀 방지)
    for (const danger of [/^merge$/i, /^review$/i, /^submit review$/i, /^label/i, /^assign/i, /^delete branch/i]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
      expect(screen.queryByRole("link", { name: danger })).toBeNull();
    }
  });
});
