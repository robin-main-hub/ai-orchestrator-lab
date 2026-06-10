import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VnLine } from "../lib/debateVnScript";
import { DebateVnView } from "./DebateVnView";

const lines: VnLine[] = [
  { speaker: "makise", text: "TTL 캐시로 가자", effect: "normal", roundKind: "initial_proposals" },
  { speaker: "asuka", text: "stale 위험 있어", effect: "counter", roundKind: "cross_critique" },
  { speaker: "chair", text: "TTL 채택", effect: "finish", roundKind: "final_decision" },
];

describe("DebateVnView", () => {
  it("renders a VN line per utterance with counter + finish effects", () => {
    const html = renderToStaticMarkup(
      <DebateVnView lines={lines} displayNameFor={(s) => (s === "makise" ? "마키세" : s)} />,
    );
    expect(html).toContain("마키세"); // display name resolver
    expect(html).toContain("vn-counter");
    expect(html).toContain("COUNTER");
    expect(html).toContain("vn-finish");
    expect(html).toContain("FINISH");
    expect(html).toContain("TTL 채택");
  });

  it("shows a portrait when provided, else the bot fallback", () => {
    const withPortrait = renderToStaticMarkup(
      <DebateVnView lines={[lines[0]!]} portraitFor={() => "/makise.png"} />,
    );
    expect(withPortrait).toContain("/makise.png");
  });

  it("shows an empty hint when there are no lines", () => {
    expect(renderToStaticMarkup(<DebateVnView lines={[]} />)).toContain("아직 대사가 없습니다");
  });
});
