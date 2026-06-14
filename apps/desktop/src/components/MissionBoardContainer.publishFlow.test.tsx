// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MissionBoardItem } from "../lib/missionBoardModel";
import type { MissionScaffoldLatestResponse } from "@ai-orchestrator/protocol";
import type { MissionPublishEnvironment } from "./MissionBoardPanel";

/**
 * App Builder → Publish Flow smoke (Container 통합).
 *
 * 사용자 contract:
 *   1) AppBuild가 만든 scaffold가 있는 미션을 펼치면(상세 토글 클릭) MissionBoardContainer가
 *      GET /missions/:id/scaffold/latest를 lazy fetch해 캐시한다.
 *   2) 캐시된 scaffold는 mergedPublishEnvironment.getScaffoldFiles로 Publish Panel에 전달되어
 *      file path/newContent가 자동 채워진다(첫 안전 파일만).
 *   3) CTA 보조 텍스트가 scaffold 유무에 따라 ready/blocked/none 모드로 정직하게 바뀐다.
 *   4) prefill 단계에서 GitHub write route(`/integrations/github/write/...`)는 절대 호출되지 않는다.
 *
 * 금지/회귀 가드:
 *   - prefill ≠ execute: 사용자 명시 클릭 전에는 GitHub mutation 0회
 *   - 추측 금지: 응답에 files=[]면 file path/content는 비고 notice는 안 보이거나 "전체 가드" 신호
 *   - merge/review/label/assignee UI 없음(상위 Panel에서 회귀 방지)
 */

/* eslint-disable react-hooks/rules-of-hooks -- vi.hoisted는 React hook이 아님 */
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

// vi.mock은 hoisted되므로 import는 mock 이후가 아니라 mock이 먼저 적용됨.
// MissionBoardContainer는 모킹된 모듈을 사용한다.
import { MissionBoardContainer } from "./MissionBoardContainer";

const MISSION_ID = "mission_appbuild_smoke_1";

function localMissionItem(): MissionBoardItem {
  // hasWorkspaceDetail이 true가 되도록 workspace 포함 — "Workspace 상세" 토글 노출 조건.
  return {
    missionId: MISSION_ID,
    title: "App Builder result — todo app",
    goal: "GitHub로 내보내기 smoke",
    status: "ready_to_merge",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 1,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_smoke",
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

function scaffoldFoundResponse(): MissionScaffoldLatestResponse {
  return {
    missionId: MISSION_ID,
    status: "found",
    truthStatus: "planned",
    planId: "plan_smoke_1",
    files: [
      {
        path: "src/util.ts",
        content: "export const v = 2;\n",
        source: "scaffold_plan",
        createdAt: "2026-06-14T12:00:00.000Z",
      },
    ],
    skipped: [],
  };
}

function scaffoldMultiFoundResponse(): MissionScaffoldLatestResponse {
  // safeCount > 1 케이스 — 다중 안전 파일이 와도 CTA 문구는 항상 "1개 자동 채움"이어야 한다(첫 파일만 prefill).
  return {
    missionId: MISSION_ID,
    status: "found",
    truthStatus: "planned",
    planId: "plan_smoke_multi",
    files: [
      { path: "src/a.ts", content: "export const a = 1;\n", source: "scaffold_plan", createdAt: "2026-06-14T12:00:00.000Z" },
      { path: "src/b.ts", content: "export const b = 2;\n", source: "scaffold_plan", createdAt: "2026-06-14T12:00:00.000Z" },
      { path: "src/c.ts", content: "export const c = 3;\n", source: "scaffold_plan", createdAt: "2026-06-14T12:00:00.000Z" },
    ],
    skipped: [],
  };
}

function scaffoldBlockedResponse(): MissionScaffoldLatestResponse {
  // 서버는 가드 통과한 파일만 files에 넣지만, 클라이언트 측 builtinMissionPrefill도 같은 가드를
  // 거친다(2중 안전선). 여기서는 "안전 파일이 0개"인 케이스를 file 본문에 시크릿을 박아 재현.
  return {
    missionId: MISSION_ID,
    status: "partial",
    truthStatus: "planned",
    planId: "plan_smoke_blocked",
    files: [
      // 클라이언트 측 secret_suspect 패턴이 잡는 ghp_ 토큰을 본문에 넣어, 안전 파일 0을 강제.
      {
        path: "ci.env",
        content: "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuv\n",
        source: "scaffold_plan",
        createdAt: "2026-06-14T12:00:00.000Z",
      },
    ],
    skipped: [],
  };
}

function scaffoldNotFoundResponse(): MissionScaffoldLatestResponse {
  return {
    missionId: MISSION_ID,
    status: "not_found",
    truthStatus: "planned",
    files: [],
    skipped: [],
    message: "등록된 scaffold plan이 없습니다",
  };
}

function makeBlockedFetchImpl() {
  // 어떤 GitHub mutation route든 호출되면 즉시 실패(가짜 observed 방지).
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return new Response(JSON.stringify({ outcome: "github_error", message: `prefill에서 호출 금지: ${url}` }), {
      status: 500,
    });
  });
  return { fetchImpl, calls };
}

/** prefill 단계에서 Mission 서버 mutation(create/verify/merge/append-event) 0회 보장 — 회귀 가드. */
function assertNoMissionMutations() {
  expect(mocks.createDgxMission).not.toHaveBeenCalled();
  expect(mocks.verifyDgxMission).not.toHaveBeenCalled();
  expect(mocks.mergeDgxMission).not.toHaveBeenCalled();
  expect(mocks.appendDgxMissionEvent).not.toHaveBeenCalled();
}

beforeEach(() => {
  mocks.fetchDgxMissions.mockReset();
  mocks.fetchMissionScaffoldLatest.mockReset();
  mocks.createDgxMission.mockReset();
  mocks.mergeDgxMission.mockReset();
  mocks.verifyDgxMission.mockReset();
  mocks.appendDgxMissionEvent.mockReset();
  // 기본: 서버에 미션 없음(빈 응답). localItems로만 미션을 주입.
  mocks.fetchDgxMissions.mockResolvedValue({ missions: [] });
});

afterEach(() => {
  cleanup();
});

describe("MissionBoardContainer — App Builder → Publish Flow smoke", () => {
  it("(#1 ready) scaffold found → file path/content prefill + 보조 텍스트=ready + GitHub write 0회", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldFoundResponse());
    const { fetchImpl, calls } = makeBlockedFetchImpl();
    const onContextEvent = vi.fn();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );

    // 미션 카드의 "Workspace 상세" 토글 클릭 → expandedMissionId set → useEffect로 scaffold fetch
    const detailToggle = await screen.findByRole("button", { name: /Workspace 상세/ });
    fireEvent.click(detailToggle);
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledTimes(1));
    expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledWith({
      missionId: MISSION_ID,
      serverBaseUrl: "http://127.0.0.1:4317",
    });

    // 보조 텍스트가 scaffold 인식 후 "ready"로 바뀐다 — 캐시 set 후 useMemo 재계산을 기다림.
    // data-scaffold 와 textContent 를 한 블록에서 검증해 사이 렌더에서 reverted 되어도 잡힌다.
    await waitFor(() => {
      const hint = screen.getByTestId("mission-workspace-publish-hint");
      expect(hint.getAttribute("data-scaffold")).toBe("ready");
      // 단일 안전 파일 — "1개 중 1개 자동 채움" 시그널
      expect(hint.textContent).toMatch(/scaffold 1개 중 1개 자동 채움 준비됨/);
    });

    // CTA 클릭 → Publish Panel 마운트
    const ctaButton = screen.getByRole("button", { name: /GitHub로 내보내기/ });
    fireEvent.click(ctaButton);

    const panel = await screen.findByTestId("github-publish-panel");

    // file path/content 자동 채움 검증
    const fileStep = within(panel).getByTestId("publish-step-file");
    const filePath = within(fileStep).getByLabelText("file path") as HTMLInputElement;
    expect(filePath.value).toBe("src/util.ts");
    const fileContent = within(fileStep).getByLabelText("file new content") as HTMLTextAreaElement;
    expect(fileContent.value).toBe("export const v = 2;\n");

    // notice가 단일 파일 시그널을 그대로 보여준다
    expect(within(fileStep).getByTestId("publish-file-notice").textContent).toMatch(/scaffold 1개/);

    // prefill 단계에서 GitHub write route는 절대 호출되지 않음(시크릿/사이드이펙트 0).
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls).toEqual([]);

    // mission.publish.opened trace는 발행됨(read-only 표면 회귀 확인)
    const openedTrace = onContextEvent.mock.calls.find((c) => c[0] === "mission.publish.opened");
    expect(openedTrace).toBeTruthy();
    expect((openedTrace![1] as Record<string, unknown>).missionId).toBe(MISSION_ID);

    // Mission 서버 mutation도 0회 — prefill은 read-only.
    assertNoMissionMutations();
  });

  it("(#2 blocked) 응답에 안전 파일이 0개면 보조 텍스트=blocked + file path/content 비움 + notice가 가드 안내", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldBlockedResponse());
    const { fetchImpl } = makeBlockedFetchImpl();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalled());

    // 보조 텍스트가 'blocked' — 모든 파일이 클라이언트 가드(시크릿 의심)에 막힘.
    await waitFor(() => {
      const hint = screen.getByTestId("mission-workspace-publish-hint");
      expect(hint.getAttribute("data-scaffold")).toBe("blocked");
    });
    expect(screen.getByTestId("mission-workspace-publish-hint").textContent).toMatch(/모두 가드/);

    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = await screen.findByTestId("github-publish-panel");

    // file 필드 비어 있음(추측 금지)
    const fileStep = within(panel).getByTestId("publish-step-file");
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("");
    expect((within(fileStep).getByLabelText("file new content") as HTMLTextAreaElement).value).toBe("");

    // notice가 '전체 가드' 신호를 보여준다
    expect(within(fileStep).getByTestId("publish-file-notice").textContent).toMatch(/모두 가드에 막혀/);

    // GitHub write fetch 0회
    expect(fetchImpl).not.toHaveBeenCalled();
    assertNoMissionMutations();
  });

  it("(#3 none) 응답에 files=[] (not_found)면 보조 텍스트=none + file 필드 비움 + notice 없음", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldNotFoundResponse());
    const { fetchImpl } = makeBlockedFetchImpl();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalled());

    // 보조 텍스트는 기본 'none' — scaffold 없음.
    await waitFor(() => {
      const hint = screen.getByTestId("mission-workspace-publish-hint");
      expect(hint.getAttribute("data-scaffold")).toBe("none");
    });

    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = await screen.findByTestId("github-publish-panel");
    const fileStep = within(panel).getByTestId("publish-step-file");
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("");
    expect((within(fileStep).getByLabelText("file new content") as HTMLTextAreaElement).value).toBe("");
    expect(within(fileStep).queryByTestId("publish-file-notice")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    assertNoMissionMutations();
  });

  it("(#4 회귀) prefill 단계 전체에서 GitHub mutation 표면(merge/review/label/assignee/delete branch) UI 부재", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldFoundResponse());
    const { fetchImpl } = makeBlockedFetchImpl();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    await screen.findByTestId("github-publish-panel");

    for (const danger of [/^merge$/i, /^review$/i, /^submit review$/i, /^label/i, /^assign/i, /^delete branch/i]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
      expect(screen.queryByRole("link", { name: danger })).toBeNull();
    }
    assertNoMissionMutations();
  });

  it("(#5 cache) 같은 미션을 닫았다가 다시 펼쳐도 scaffold fetch는 한 번만(네트워크 절약)", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldFoundResponse());
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );
    const toggle = await screen.findByRole("button", { name: /Workspace 상세/ });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledTimes(1));
    fireEvent.click(toggle); // 닫기
    fireEvent.click(toggle); // 다시 펼치기
    // 추가 호출 없음 — 캐시 hit
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledTimes(1));
    assertNoMissionMutations();
  });

  it("(#6 multi) safeCount > 1 — 다중 안전 파일이 와도 prefill은 첫 파일만, CTA는 '중 1개 자동 채움' 일관 표시", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldMultiFoundResponse());
    const { fetchImpl } = makeBlockedFetchImpl();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalled());

    // CTA 보조 텍스트: total은 응답 그대로지만 자동 채움 갯수는 항상 1(실제 prefill 동작과 일치).
    await waitFor(() => {
      const hint = screen.getByTestId("mission-workspace-publish-hint");
      expect(hint.getAttribute("data-scaffold")).toBe("ready");
      expect(hint.textContent).toMatch(/scaffold 3개 중 1개 자동 채움 준비됨/);
    });

    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = await screen.findByTestId("github-publish-panel");
    const fileStep = within(panel).getByTestId("publish-step-file");
    // 첫 파일만 prefill — 나머지는 별도 plan으로.
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("src/a.ts");
    expect((within(fileStep).getByLabelText("file new content") as HTMLTextAreaElement).value).toBe("export const a = 1;\n");
    expect(within(fileStep).getByTestId("publish-file-notice").textContent).toMatch(/scaffold 3개 중 1개 자동 채움/);

    expect(fetchImpl).not.toHaveBeenCalled();
    assertNoMissionMutations();
  });

  it("(#7 reject) fetchMissionScaffoldLatest가 실패해도 CTA는 막히지 않고 'none' 모드로 안전 fallback + 추측 없음", async () => {
    // 첫 호출은 reject — Container catch 블록이 silent fail해야 한다(캐시 미적용 → 다음 펼치기 재시도).
    mocks.fetchMissionScaffoldLatest.mockRejectedValueOnce(new Error("network down"));
    const { fetchImpl } = makeBlockedFetchImpl();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledTimes(1));

    // CTA는 'none' — 추측 금지(추측으로 ready 표시 절대 안 됨).
    await waitFor(() => {
      const hint = screen.getByTestId("mission-workspace-publish-hint");
      expect(hint.getAttribute("data-scaffold")).toBe("none");
    });

    // CTA 클릭 → Panel은 정상 마운트(에러가 막지 않음). file 필드는 비어 있음(추측 금지).
    fireEvent.click(screen.getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = await screen.findByTestId("github-publish-panel");
    const fileStep = within(panel).getByTestId("publish-step-file");
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("");
    expect((within(fileStep).getByLabelText("file new content") as HTMLTextAreaElement).value).toBe("");

    expect(fetchImpl).not.toHaveBeenCalled();
    assertNoMissionMutations();
  });
});
