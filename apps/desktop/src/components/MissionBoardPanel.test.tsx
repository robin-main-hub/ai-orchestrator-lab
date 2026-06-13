import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MissionBoardItem, MissionBoardSnapshot } from "../lib/missionBoardModel";
import { MissionBoardPanel } from "./MissionBoardPanel";

function item(overrides: Partial<MissionBoardItem> = {}): MissionBoardItem {
  return {
    missionId: "mission_1",
    title: "Provider fallback 검증",
    goal: "fallback 경로가 실제로 동작하는지",
    status: "running",
    truthStatus: "observed",
    source: "server_observed",
    workers: [
      {
        agentId: "agent_verifier",
        displayName: "Verifier",
        role: "verifier",
        capabilityMode: "sandbox_verify",
        canMutateFiles: false,
        hermesSlotId: "hermes-05",
      },
    ],
    artifactCount: 1,
    verificationCount: 0,
    mergeQueueCount: 0,
    updatedAt: "2026-06-13T01:00:00.000Z",
    ...overrides,
  };
}

function snapshot(items: MissionBoardItem[], reachable = true): MissionBoardSnapshot {
  return { items, serverReachable: reachable, serverError: reachable ? undefined : "connect ECONNREFUSED" };
}

const noop = () => {};

describe("MissionBoardPanel", () => {
  it("renders server-hydrated missions with source, truth, and Hermes slot visible", () => {
    const html = renderToStaticMarkup(
      <MissionBoardPanel snapshot={snapshot([item()])} onRefresh={noop} verifyAvailable />,
    );
    expect(html).toContain("DGX 연결됨");
    expect(html).toContain("DGX 저장됨");
    expect(html).toContain("observed"); // truth label은 숨기지 않는다
    expect(html).toContain("hermes-05");
    expect(html).toContain("진행 중");
  });

  it("keeps the local fallback visible and honest when the server is unreachable", () => {
    const html = renderToStaticMarkup(
      <MissionBoardPanel
        snapshot={snapshot([item({ source: "local_fallback", truthStatus: "planned" })], false)}
        onRefresh={noop}
      />,
    );
    expect(html).toContain("서버 미연결");
    expect(html).toContain("connect ECONNREFUSED");
    expect(html).toContain("로컬 임시");
    expect(html).toContain("planned");
  });

  it("shows the verify button only for server missions with a sandbox_verify worker", () => {
    const verifiable = renderToStaticMarkup(
      <MissionBoardPanel snapshot={snapshot([item()])} onRefresh={noop} onVerify={vi.fn()} verifyAvailable />,
    );
    expect(verifiable).toContain("검증 실행");

    const noVerifier = renderToStaticMarkup(
      <MissionBoardPanel
        snapshot={snapshot([item({ workers: [] })])}
        onRefresh={noop}
        onVerify={vi.fn()}
        verifyAvailable
      />,
    );
    expect(noVerifier).not.toContain("검증 실행");

    const noPacket = renderToStaticMarkup(
      <MissionBoardPanel snapshot={snapshot([item()])} onRefresh={noop} onVerify={vi.fn()} verifyAvailable={false} />,
    );
    expect(noPacket).toContain("검증 명령 없음");
  });

  it("offers merge queueing only on an observed passed verification (D3 invariant in the UI)", () => {
    const queueable = renderToStaticMarkup(
      <MissionBoardPanel
        snapshot={snapshot([
          item({ verificationCount: 1, latestVerification: { id: "v1", status: "passed", observed: true } }),
        ])}
        onRefresh={noop}
        onQueueMerge={vi.fn()}
      />,
    );
    expect(queueable).toContain("병합 대기열 등록");

    const unobserved = renderToStaticMarkup(
      <MissionBoardPanel
        snapshot={snapshot([
          item({ verificationCount: 1, latestVerification: { id: "v1", status: "passed", observed: false } }),
        ])}
        onRefresh={noop}
        onQueueMerge={vi.fn()}
      />,
    );
    expect(unobserved).not.toContain("병합 대기열 등록");
    expect(unobserved).toContain("미관측");
  });

  it("renders the empty state per connection state", () => {
    expect(renderToStaticMarkup(<MissionBoardPanel snapshot={snapshot([])} onRefresh={noop} />)).toContain(
      "저장된 미션이 없습니다",
    );
    expect(renderToStaticMarkup(<MissionBoardPanel snapshot={snapshot([], false)} onRefresh={noop} />)).toContain(
      "서버 미연결",
    );
  });
});
