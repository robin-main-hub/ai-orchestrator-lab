import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkTraceSearchItem } from "../../lib/workTraceSearch";
import { WorkReceiptLedgerCard } from "./WorkReceiptLedgerCard";

const receiptItem: WorkTraceSearchItem = {
  createdAt: "2026-06-05T08:00:00.000Z",
  id: "utterance_1",
  kind: "debate",
  title: "토론 공개 브리핑 · 최종 결정",
  receiptStatus: "checkpointed",
  safetyLabel: "검색 가능",
  searchable: true,
  searchText: "토론 공개 브리핑 최종 결정",
  trace: {
    receipt: {
      label: "토론 실행 브리핑",
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
  it("최근 공개 브리핑과 검색 안전 상태를 Cockpit에서 읽을 수 있게 렌더링한다", () => {
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
            title: "비공개 대화 브리핑",
          },
        ]}
      />,
    );

    expect(html).toContain("작업 브리핑");
    expect(html).toContain("토론 공개 브리핑 · 최종 결정");
    expect(html).toContain("토론 실행 브리핑");
    expect(html).toContain("검색 가능");
    expect(html).toContain("검색 제외 필요");
    expect(html).toContain("GitHub #251");
    expect(html).toContain("https://github.com/robin-main-hub/ai-orchestrator-lab/issues/251");
  });

  it("터미널 브리핑의 내부 상태값을 첫 표면에 영어로 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <WorkReceiptLedgerCard
        items={[
          {
            ...receiptItem,
            id: "terminal_1",
            kind: "tmux",
            receiptStatus: "fallback",
            title: "터미널 보정 기록",
            trace: {
              ...receiptItem.trace,
              receipt: {
                label: "터미널 실행 브리핑",
                status: "fallback",
                items: [
                  { label: "범위", value: "디스패치" },
                  { label: "기준점", value: "터미널 세션 · 작업창" },
                  { label: "마스킹", value: "적용됨" },
                ],
              },
            },
          },
        ]}
      />,
    );

    expect(html).toContain("터미널");
    expect(html).toContain("대체 경로");
    expect(html).toContain("공개 요약");
    expect(html).toContain("상세 보기");
    expect(html).not.toContain("tmux");
    expect(html).not.toContain("fallback");
    expect(html).not.toContain("공개 trace");
  });

  it("장부 제목도 렌더 직전에 비밀값과 내부 입력 표면을 마스킹한다", () => {
    const html = renderToStaticMarkup(
      <WorkReceiptLedgerCard
        items={[
          {
            ...receiptItem,
            id: "secret_title",
            kind: "conversation",
            safetyLabel: "마스킹 확인 필요",
            searchable: false,
            title: "raw prompt: hidden Bearer sk-1234567890abcdef /Users/robin/Documents",
          },
        ]}
      />,
    );

    expect(html).not.toContain("raw prompt");
    expect(html).not.toContain("sk-1234567890abcdef");
    expect(html).not.toContain("/Users/robin/Documents");
    expect(html).toContain("[redacted");
  });

  it("장부 상단에서 전체 수량, 검색 가능 수량, 출처별 수량을 압축 요약한다", () => {
    const html = renderToStaticMarkup(
      <WorkReceiptLedgerCard
        items={[
          receiptItem,
          {
            ...receiptItem,
            id: "conversation_1",
            kind: "conversation",
            title: "대화 공개 브리핑",
          },
          {
            ...receiptItem,
            id: "terminal_1",
            kind: "tmux",
            searchable: false,
            safetyLabel: "검색 제외 필요",
            title: "터미널 공개 브리핑",
          },
        ]}
      />,
    );

    expect(html).toContain("총 3건");
    expect(html).toContain("검색 2건");
    expect(html).toContain("점검 1건");
    expect(html).toContain("대화 1");
    expect(html).toContain("토론 1");
    expect(html).toContain("터미널 1");
  });

  it("실패나 주의 브리핑은 첫 표면에 핵심 경고 근거를 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <WorkReceiptLedgerCard
        items={[
          {
            ...receiptItem,
            id: "failed_provider",
            kind: "conversation",
            receiptStatus: "blocked",
            title: "모델 호출 실패 브리핑",
            trace: {
              receipt: {
                label: "에이전트 실행 브리핑",
                status: "blocked",
                items: [
                  { label: "범위", value: "생성" },
                  { label: "기준점", value: "message_failed" },
                  { label: "마스킹", value: "적용됨" },
                ],
              },
              groups: [
                {
                  id: "steps",
                  title: "작업 단계",
                  items: [{ id: "runtime-warning", label: "실행 경고", tone: "danger", value: "Failed to fetch" }],
                },
              ],
            },
          },
        ]}
      />,
    );

    expect(html).toContain("핵심 경고");
    expect(html).toContain("실행 경고");
    expect(html).toContain("Failed to fetch");
  });

  it("입력 순서가 섞여도 실제 createdAt 기준 최신 브리핑을 먼저 보여준다", () => {
    const html = renderToStaticMarkup(
      <WorkReceiptLedgerCard
        items={[
          { ...receiptItem, createdAt: "2026-06-05T08:00:00.000Z", id: "old", title: "오래된 브리핑" },
          { ...receiptItem, createdAt: "2026-06-05T08:10:00.000Z", id: "new", title: "가장 최신 브리핑" },
        ]}
      />,
    );

    expect(html.indexOf("가장 최신 브리핑")).toBeLessThan(html.indexOf("오래된 브리핑"));
  });

  it("검색어와 종류 필터로 장부를 즉시 좁히고 원본 보기 동선을 노출한다", () => {
    const html = renderToStaticMarkup(
      <WorkReceiptLedgerCard
        initialKind="approval"
        initialQuery="provider"
        items={[
          {
            ...receiptItem,
            id: "approval_1",
            kind: "approval",
            searchText: "provider approval 승인",
            title: "provider 승인 브리핑",
          },
          {
            ...receiptItem,
            id: "debate_1",
            kind: "debate",
            searchText: "provider debate 토론",
            title: "provider 토론 브리핑",
          },
        ]}
      />,
    );

    expect(html).toContain("작업 브리핑 검색");
    expect(html).toContain("provider 승인 브리핑");
    expect(html).toContain("원본 보기");
    expect(html).not.toContain("provider 토론 브리핑");
  });
});
