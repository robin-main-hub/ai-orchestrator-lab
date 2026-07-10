// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import { SummonTheater } from "./SummonTheater";

/**
 * THR-4 실황 효과 실행동(jsdom) 테스트.
 *
 * 컷인 배너·종결 브리핑 카드는 "극장 마운트 중 새 이벤트/카운트 변화"에만 발화하는
 * effect+ref 로직이라 renderToStaticMarkup(정적) 으로는 검증 불가 → 여기서 mount 후
 * re-render 로 실측한다. 실황 피드·U3 툴팁·자막·되감기 절단은 정적 테스트
 * (SummonTheater.test.tsx) + 오케스트레이터 preview 실증으로 커버됨.
 *
 * 테스트 4(되감기 중 컷인 억제)는 생략: TimelineScrubber 스크럽 상호작용(jsdom 포인터
 * 시퀀스) 재현이 과도하게 번거롭고, 억제 근거인 피드 절단(framesUpTo)·isLiveRef 경로는
 * preview 실증 + recentFeedFrames 순수 테스트로 커버되어 있음.
 */

function ev(id: string, type: string, createdAt: string, payload: unknown = {}): EventEnvelope {
  return { id, sessionId: "s1", type, payload, createdAt, source: "desktop", sourceTrust: "trusted", redacted: false };
}

const agents = [
  { id: "agent_kurumi", role: "verifier", personaName: "kurumi", displayName: "쿠루미" },
] as unknown as Parameters<typeof SummonTheater>[0]["agents"];

const cards = [
  {
    id: "card_1",
    targetAgentId: "agent_kurumi",
    targetAgentName: "쿠루미",
    targetRoleLabel: "qa",
    title: "쿠루미에게 회귀 검토",
    summary: "변경 후 깨질 흐름을 먼저 찾습니다.",
    toolLabel: "",
    toolPreview: [],
    targetSurface: "conversation",
    priority: "normal",
  },
] as unknown as Parameters<typeof SummonTheater>[0]["cards"];

function assignments(status: string) {
  return { agent_kurumi: { lane: "auto", status, workItemId: "w1" } } as unknown as NonNullable<
    Parameters<typeof SummonTheater>[0]["assignmentsByAgentId"]
  >;
}

const baseEvents: EventEnvelope[] = [
  ev("e1", "session.created", "2026-07-10T00:00:00.000Z"),
  ev("e2", "message.posted", "2026-07-10T00:00:05.000Z"),
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SummonTheater 실황 효과 (jsdom 실행동)", () => {
  it("컷인: 마운트 후 새 permission.approved 프레임 도착 → accent 컷인 5s 노출 후 소멸", () => {
    const { container, rerender } = render(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("in_progress")} cards={cards} events={baseEvents} />,
    );
    // 기준선: 마운트 시점 이력만으로는 컷인 없음
    expect(container.querySelector(".theater-v2__cutin")).toBeNull();

    // 새 이벤트 도착(라이브) → 컷인 발화
    const nextEvents = [...baseEvents, ev("e3", "permission.approved", "2026-07-10T00:00:12.000Z")];
    rerender(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("in_progress")} cards={cards} events={nextEvents} />,
    );
    const cutin = container.querySelector(".theater-v2__cutin");
    expect(cutin).not.toBeNull();
    expect(cutin!.className).toContain("theater-v2__cutin--accent");
    expect(cutin!.textContent).toContain("승인됨");
    expect(cutin!.textContent).toContain("+00:12");

    // 자동 소거 5s
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.querySelector(".theater-v2__cutin")).toBeNull();
  });

  it("컷인: 실패 이벤트는 destructive 톤", () => {
    const { container, rerender } = render(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("in_progress")} cards={cards} events={baseEvents} />,
    );
    rerender(
      <SummonTheater
        agents={agents}
        assignmentsByAgentId={assignments("in_progress")}
        cards={cards}
        events={[...baseEvents, ev("e3", "autonomy.run.failed", "2026-07-10T00:00:20.000Z")]}
      />,
    );
    const cutin = container.querySelector(".theater-v2__cutin");
    expect(cutin).not.toBeNull();
    expect(cutin!.className).toContain("theater-v2__cutin--destructive");
  });

  it("컷인 마운트 억제: 첫 mount 이력에 중요 이벤트가 이미 있어도 컷인 없음(기준선)", () => {
    const seeded = [...baseEvents, ev("e3", "permission.requested", "2026-07-10T00:00:12.000Z")];
    const { container } = render(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("in_progress")} cards={cards} events={seeded} />,
    );
    expect(container.querySelector(".theater-v2__cutin")).toBeNull();
    // 시간이 지나도 발화하지 않음(과거 이력은 드라마가 아님)
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(container.querySelector(".theater-v2__cutin")).toBeNull();
  });

  it("종결 브리핑: done 0 → 1 증가 시 作戦完了 배너 + 브리핑 카드 노출, 8s 후 소멸", () => {
    const { container, rerender } = render(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("in_progress")} cards={cards} events={baseEvents} />,
    );
    expect(container.querySelector(".theater-v2__briefing")).toBeNull();

    // 진행 중 → 완료 전이(직전 렌더 대비 done 수 증가)
    rerender(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("done")} cards={cards} events={baseEvents} />,
    );
    const briefing = container.querySelector(".theater-v2__briefing");
    expect(briefing).not.toBeNull();
    expect(briefing!.textContent).toContain("作戦完了");
    expect(briefing!.textContent).toContain("작전 완료");
    expect(briefing!.textContent).toContain("회귀 검토"); // 실데이터 임무 제목
    expect(briefing!.textContent).toContain("브리핑 로그에 기록됨"); // §0-C 어휘("영수증" 금지)
    expect(briefing!.textContent).toContain("쿠루미"); // 수행 캐릭터

    // 자동 소거 8s
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(container.querySelector(".theater-v2__briefing")).toBeNull();
  });

  it("종결 브리핑: blocked 증가 시 destructive 막힘 배너 + 수동 닫기", () => {
    const { container, rerender } = render(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("in_progress")} cards={cards} events={baseEvents} />,
    );
    rerender(
      <SummonTheater agents={agents} assignmentsByAgentId={assignments("blocked")} cards={cards} events={baseEvents} />,
    );
    const briefing = container.querySelector(".theater-v2__briefing");
    expect(briefing).not.toBeNull();
    expect(briefing!.className).toContain("theater-v2__briefing--blocked");
    expect(briefing!.textContent).toContain("작전 막힘");

    // 수동 닫기 버튼(lucide X)
    const close = container.querySelector<HTMLButtonElement>(".theater-v2__briefing-close");
    expect(close).not.toBeNull();
    act(() => {
      close!.click();
    });
    expect(container.querySelector(".theater-v2__briefing")).toBeNull();
  });
});
