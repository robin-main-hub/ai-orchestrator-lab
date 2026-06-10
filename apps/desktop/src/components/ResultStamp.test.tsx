import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultStamp, stampForLoopStatus } from "./ResultStamp";

describe("stampForLoopStatus", () => {
  it("maps each loop status to a stamp label + tone", () => {
    expect(stampForLoopStatus("completed")).toEqual({ label: "完了", tone: "success" });
    expect(stampForLoopStatus("failed")).toEqual({ label: "失敗", tone: "danger" });
    expect(stampForLoopStatus("awaiting_human")).toEqual({ label: "承認待", tone: "warning" });
    expect(stampForLoopStatus("running")).toEqual({ label: "実行中", tone: "info" });
  });
});

describe("ResultStamp", () => {
  it("renders the label with the tone class", () => {
    const html = renderToStaticMarkup(<ResultStamp label="完了" tone="success" />);
    expect(html).toContain("完了");
    expect(html).toContain("result-stamp-success");
    expect(html).toContain('aria-label="完了"');
  });
});
