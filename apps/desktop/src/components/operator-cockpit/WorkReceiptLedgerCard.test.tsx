import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkTraceSearchItem } from "../../lib/workTraceSearch";
import { WorkReceiptLedgerCard } from "./WorkReceiptLedgerCard";

const receiptItem: WorkTraceSearchItem = {
  id: "utterance_1",
  kind: "debate",
  title: "토론 공개 영수증 · 최종 결정",
  receiptStatus: "checkpointed",
  safetyLabel: "검색 가능",
  searchable: true,
  searchText: "토론 공개 영수증 최종 결정",
  trace: {
    receipt: {
      label: "토론 실행 영수증",
      status: "checkpointed",
      items: [
        { label: "범위", value: "토론/round_1" },
        { label: "기준점", value: "agent_reviewer · 최종 결정" },
        { label: "마스킹", value: "적용됨" },
      ],
    },
    groups: [
      {
        id: "steps",
        title: "작업 단계",
        items: [{ id: "stage", label: "토론 단계", tone: "info", value: "최종 결정 · Reviewer" }],
      },
    ],
  },
};

describe("WorkReceiptLedgerCard", () => {
  it("최근 공개 영수증과 검색 안전 상태를 Cockpit에서 읽을 수 있게 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <WorkReceiptLedgerCard
        items={[
          receiptItem,
          {
            ...receiptItem,
            id: "unsafe",
            kind: "conversation",
            safetyLabel: "검색 제외 필요",
            searchable: false,
            title: "비공개 대화 영수증",
          },
        ]}
      />,
    );

    expect(html).toContain("작업 영수증");
    expect(html).toContain("토론 공개 영수증 · 최종 결정");
    expect(html).toContain("토론 실행 영수증");
    expect(html).toContain("검색 가능");
    expect(html).toContain("검색 제외 필요");
  });
});
