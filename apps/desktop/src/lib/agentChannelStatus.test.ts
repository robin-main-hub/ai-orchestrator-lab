import { describe, expect, it } from "vitest";
import { createAgentChannelStatus } from "./agentChannelStatus";

describe("createAgentChannelStatus", () => {
  it("summarizes a continuing agent channel with applied memories", () => {
    expect(
      createAgentChannelStatus({
        agentName: "마키마",
        adapterStatus: "ready",
        memoryRecordCount: 7,
        messageCount: 4,
      }),
    ).toEqual({
      title: "마키마 전용 채널",
      continuityLabel: "이전 대화 이어받음 · 4개 메시지",
      memoryLabel: "기억 7개 적용",
      tone: "ready",
    });
  });

  it("summarizes an empty channel without pretending memory is ready", () => {
    expect(
      createAgentChannelStatus({
        agentName: "마키세 크리스",
        adapterStatus: "loading",
        memoryRecordCount: 0,
        messageCount: 0,
      }),
    ).toEqual({
      title: "마키세 크리스 전용 채널",
      continuityLabel: "새 대화 시작",
      memoryLabel: "기억 조회 중",
      tone: "loading",
    });
  });
});
