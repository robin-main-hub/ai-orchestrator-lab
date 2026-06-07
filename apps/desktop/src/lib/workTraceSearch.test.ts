import { describe, expect, it } from "vitest";
import type { PublicWorkTrace } from "./publicWorkTrace";
import {
  createWorkTraceSearchIndex,
  searchWorkTraceIndex,
} from "./workTraceSearch";

const trace: PublicWorkTrace = {
  groups: [
    {
      id: "steps",
      title: "작업 단계",
      items: [
        { id: "provider", label: "모델 호출", value: "MiMo OpenAI · MiMo V2.5 Pro", tone: "success" },
      ],
    },
    {
      id: "evidence",
      title: "검증",
      items: [
        { id: "memory", label: "기억 조회", value: "3개 recall", tone: "info" },
      ],
    },
  ],
  receipt: {
    label: "에이전트 실행 영수증",
    status: "checkpointed",
    items: [
      { label: "범위", value: "생성/메모리" },
      { label: "기준점", value: "session_main · recall_001" },
      { label: "마스킹", value: "적용됨" },
    ],
  },
};

describe("workTraceSearch", () => {
  it("공개 영수증과 trace group을 검색 가능한 색인으로 만든다", () => {
    const index = createWorkTraceSearchIndex([
      { id: "msg_1", kind: "conversation", title: "마키마 응답", trace },
      { id: "tmux_1", kind: "tmux", title: "터미널 실행", trace: { groups: [] } },
    ]);

    expect(index).toHaveLength(2);
    expect(index[0]?.searchText).toContain("mimo openai");
    expect(index[0]?.receiptStatus).toBe("checkpointed");
    expect(searchWorkTraceIndex(index, "기억 recall").map((item) => item.id)).toEqual(["msg_1"]);
  });

  it("검색 색인은 비밀값을 포함하면 차단 상태로 표시한다", () => {
    const index = createWorkTraceSearchIndex([
      {
        id: "unsafe",
        kind: "conversation",
        title: "위험 trace",
        trace: {
          groups: [
            {
              id: "evidence",
              title: "검증",
              items: [{ id: "raw", label: "원문", value: "Bearer sk-secret1234567890", tone: "danger" }],
            },
          ],
        },
      },
    ]);

    expect(index[0]).toMatchObject({
      id: "unsafe",
      safetyLabel: "검색 제외 필요",
      searchable: false,
    });
    expect(searchWorkTraceIndex(index, "secret")).toEqual([]);
  });
});
