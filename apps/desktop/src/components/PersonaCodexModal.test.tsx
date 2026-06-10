import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PersonaCodexModal } from "./PersonaCodexModal";

const detail = {
  entry: { personaName: "verifier", displayName: "마키세 크리스", role: "verifier", caption: "검증 · 과학적 엄밀" },
  soulExcerpt: "나는 Makise Kurisu. 검증이라는 이름으로도 넘기지 않는다.",
  permissionLevel: "read_only",
  enabled: true,
  paneRole: "qa" as const,
  slotId: undefined,
};

describe("PersonaCodexModal", () => {
  it("renders the character file: card, badges, soul excerpt, and summon actions", () => {
    const html = renderToStaticMarkup(
      <PersonaCodexModal
        detail={detail}
        onClose={vi.fn()}
        onSummonAutonomy={vi.fn()}
        onSummonParallel={vi.fn()}
        onOpenSwarm={vi.fn()}
      />,
    );
    expect(html).toContain("마키세 크리스");
    expect(html).toContain("agents/verifier");
    expect(html).toContain("권한 read_only");
    expect(html).toContain("배치"); // matched workstation badge
    expect(html).toContain("슬롯 미바인딩");
    expect(html).toContain("나는 Makise Kurisu");
    expect(html).toContain("자율실행으로 소환");
    expect(html).toContain("병렬 미션에 투입");
    expect(html).toContain("스웜 보드에서 보기");
  });

  it("unplaced characters show the manual-placement badge and no swarm action", () => {
    const html = renderToStaticMarkup(
      <PersonaCodexModal
        detail={{ ...detail, entry: { personaName: "negotiator", displayName: "스파클", role: "negotiator", caption: "협상" }, paneRole: undefined, soulExcerpt: "" }}
        onClose={vi.fn()}
        onSummonAutonomy={vi.fn()}
        onSummonParallel={vi.fn()}
      />,
    );
    expect(html).toContain("미배치 — 직접 배치 예정");
    expect(html).not.toContain("스웜 보드에서 보기");
    expect(html).toContain("영혼 파일이 아직 비어 있습니다");
  });
});
