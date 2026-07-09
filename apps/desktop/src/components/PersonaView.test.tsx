// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonaView } from "./PersonaView";

afterEach(() => cleanup());

describe("PersonaView (re-homed persona showcase)", () => {
  it("renders the summon party, the codex carousel, and recent runs", () => {
    const html = renderToStaticMarkup(
      <PersonaView
        personas={[
          { personaName: "kurumi", displayName: "토키사키 쿠루미", role: "companion", tagline: "「오빠는 명령만♡」", reason: "오늘 활성" },
          { personaName: "yuno", displayName: "가사이 유노", role: "auditor", tagline: "「다 보고 있을게♡」" },
        ]}
        history={[
          { runId: "r1", personaName: "kurumi", goal: "위젯 구현", stepCount: 4, status: "completed" },
        ]}
        onNavigate={vi.fn()}
      />,
    );
    // 소환진 — 오늘의 파티 (홈에서 이관)
    expect(html).toContain("소환진 — 오늘의 파티");
    expect(html).toContain("토키사키 쿠루미");
    expect(html).toContain("가사이 유노");
    expect(html).toContain("dashboard__party-reason");
    expect(html).toContain("오늘 활성");
    // 캐릭터 도감 — 전원 (기능 보존)
    expect(html).toContain("캐릭터 도감 — 전원 18인");
    expect(html).toContain("is-carousel");
    expect(html).toContain("전체 보기");
    for (const name of ["마키마", "마키세 크리스", "렘", "프리렌"]) {
      expect(html).toContain(name);
    }
    // 최근 작전 기록
    expect(html).toContain("최근 작전 기록");
    expect(html).toContain("위젯 구현");
  });

  it("omits the recent-runs section when there is no history", () => {
    const html = renderToStaticMarkup(
      <PersonaView personas={[]} history={[]} onNavigate={vi.fn()} />,
    );
    expect(html).not.toContain("최근 작전 기록");
  });
});
