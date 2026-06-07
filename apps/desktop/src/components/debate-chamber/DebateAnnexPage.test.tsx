import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../../runtime/stage3Runtime";
import { DebateAnnexPage, resolveDebateAnnexAgentLabel } from "./DebateAnnexPage";

const session = {
  id: "debate_annex_names",
  problem: "Annex 내부 ID 숨김",
  summary: "로그 표면에는 캐릭터 이름을 보여준다.",
  contextPreview: [],
  humanPeek: [],
  participants: [
    {
      agentId: "agent_reviewer",
      modelId: "claude-opus-4-8",
      name: "시노미야 카구야",
      providerName: "Claude",
      role: "reviewer",
    },
  ],
  promotedAt: "2026-06-06T00:00:00.000Z",
  rounds: [
    {
      debateId: "debate_annex_names",
      id: "round_1",
      kind: "final_decision",
      status: "completed",
      title: "근거 정리",
      utterances: [
        {
          agentId: "agent_reviewer",
          content: "증거를 패킷으로 넘길 수 있습니다.",
          createdAt: "2026-06-06T00:01:00.000Z",
          evidenceRefIds: ["evidence_design_gap"],
          id: "utterance_1",
          roundId: "round_1",
          tags: ["evidence", "coding_impact"],
        },
      ],
    },
  ],
  statusHub: [],
} satisfies Stage3DebateSession;

const runtime: RuntimeSnapshot = {
  activeProviderProfileId: "provider_mimo",
  dgxStatus: "online",
  localModelStatus: "online",
  localModels: [],
  memorySyncStatus: "online",
  runtimeNodes: [],
  status: "online",
  syncTopology: {
    authorityLabel: "MacBook Pro",
    authorityNodeId: "macbook",
    clients: [],
    conflictPolicy: "manual_review",
    eventStoreMode: "dgx02_authoritative_with_client_cache",
    offlineWritePolicy: "append_local_outbox_when_offline",
  },
  updatedAt: "2026-06-06T00:00:00.000Z",
};

describe("DebateAnnexPage", () => {
  it("Annex 로그에서 내부 agentId 대신 캐릭터 이름을 사용한다", () => {
    expect(resolveDebateAnnexAgentLabel(session, "agent_reviewer")).toBe("시노미야 카구야");
    expect(resolveDebateAnnexAgentLabel(session, "agent_unknown_worker")).toBe("알 수 없는 워커");
  });

  it("근거 보관함에서 패킷 생성, 에이전트 대화, 승인 큐 액션을 노출한다", () => {
    const html = renderToStaticMarkup(
      <DebateAnnexPage
        initialTab="evidence"
        onAskAgent={() => undefined}
        onCreateCodingPacket={() => undefined}
        onViewApproval={() => undefined}
        pendingApprovals={1}
        runtime={runtime}
        session={session}
      />,
    );

    expect(html).toContain("evidence_design_gap");
    expect(html).toContain("패킷으로");
    expect(html).toContain("대화로");
    expect(html).toContain("승인 큐");
  });
});
