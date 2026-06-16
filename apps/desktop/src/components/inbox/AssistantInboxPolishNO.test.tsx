// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInbox } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { StatusBadge, SourceBadge } from "./StatusBadge";
import { EvidenceCard } from "./EvidenceCard";
import { LearningLoopCard, type LearningLoopItem } from "./LearningLoopCard";
import { RuntimeManifestPreviewCard } from "./RuntimeManifestPreviewCard";
import {
  LEARNING_EVENT_FIXTURE,
  projectLearningLoopItems,
  projectMemoryCandidatesFromProjectRecords,
  summarizeLearningLive,
} from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

describe("LINE N — unified StatusBadge", () => {
  it("renders PASS / WARNING / BLOCKED with a consistent data-status-kind", () => {
    render(
      <div>
        <StatusBadge kind="pass" data-testid="sb-pass" />
        <StatusBadge kind="warning" data-testid="sb-warn" />
        <StatusBadge kind="blocked" data-testid="sb-block" />
      </div>,
    );
    expect(screen.getByTestId("sb-pass").getAttribute("data-status-kind")).toBe("pass");
    expect(screen.getByTestId("sb-pass").textContent).toContain("PASS");
    expect(screen.getByTestId("sb-warn").getAttribute("data-status-kind")).toBe("warning");
    expect(screen.getByTestId("sb-warn").textContent).toContain("WARNING");
    expect(screen.getByTestId("sb-block").getAttribute("data-status-kind")).toBe("blocked");
    expect(screen.getByTestId("sb-block").textContent).toContain("BLOCKED");
  });

  it("evidence + manifest cards drive their status pill through the shared kind", () => {
    render(
      <div>
        <EvidenceCard item={{ id: "x", title: "build", verdict: "pass" }} />
        <RuntimeManifestPreviewCard
          entries={[
            { id: "s1", name: "alpha", loadable: true },
            { id: "s3", name: "gamma", loadable: false, reason: "eval_failed" },
          ]}
        />
      </div>,
    );
    expect(screen.getByTestId("evidence-verdict-x").getAttribute("data-status-kind")).toBe("pass");
    expect(screen.getByTestId("runtime-manifest-state-s1").getAttribute("data-status-kind")).toBe(
      "pass",
    );
    expect(screen.getByTestId("runtime-manifest-state-s3").getAttribute("data-status-kind")).toBe(
      "blocked",
    );
    // verdict/loadable data attrs preserved for back-compat
    expect(screen.getByTestId("evidence-verdict-x").getAttribute("data-verdict")).toBe("pass");
    expect(screen.getByTestId("runtime-manifest-state-s3").getAttribute("data-loadable")).toBe(
      "false",
    );
  });
});

describe("LINE N — unified SourceBadge (live / empty / example)", () => {
  it("renders all three provenance kinds with stable testids", () => {
    render(
      <div>
        <SourceBadge id="a" source="live" />
        <SourceBadge id="b" source="empty" />
        <SourceBadge id="c" source="example" />
      </div>,
    );
    expect(screen.getByTestId("assistant-inbox-source-a").getAttribute("data-source")).toBe("live");
    expect(screen.getByTestId("assistant-inbox-source-b").getAttribute("data-source")).toBe(
      "empty",
    );
    const ex = screen.getByTestId("assistant-inbox-source-c");
    expect(ex.getAttribute("data-source")).toBe("example");
    expect(ex.textContent).toContain("예시");
  });

  it("inbox header surfaces a live-section count", () => {
    render(
      <AssistantInbox
        evidence={[{ id: "e", title: "t", verdict: "pass" }]}
        sources={{ evidence: "live", learning: "empty", memory: "empty", manifest: "empty" }}
      />,
    );
    expect(screen.getByTestId("assistant-inbox-live-count").getAttribute("data-live-sections")).toBe(
      "1",
    );
    expect(screen.getByTestId("assistant-inbox-live-count").textContent).toContain("1/4 live");
  });
});

describe("LINE O — richer live learning projection", () => {
  it("projects hypothesis / verified / rejected counts off the real record", () => {
    const items = projectLearningLoopItems(LEARNING_EVENT_FIXTURE);
    const verifiedLoop = items.find((i) => i.id === "loop-001")!;
    expect(verifiedLoop.stage).toBe("verified");
    expect(verifiedLoop.hypothesisCount).toBe(1);
    expect(verifiedLoop.verifiedCount).toBe(1);
    expect(verifiedLoop.rejectedCount).toBe(0);

    const rejectedLoop = items.find((i) => i.id === "loop-002")!;
    expect(rejectedLoop.stage).toBe("rejected");
    expect(rejectedLoop.rejectedCount).toBe(1);
  });

  it("renders the loop fidelity counters in the card", () => {
    const item: LearningLoopItem = {
      id: "lc",
      title: "race",
      stage: "verified",
      hypothesisCount: 2,
      verifiedCount: 1,
      rejectedCount: 0,
    };
    render(<LearningLoopCard item={item} />);
    const counters = screen.getByTestId("learning-loop-counters-lc");
    expect(counters.getAttribute("data-hypotheses")).toBe("2");
    expect(counters.getAttribute("data-verified")).toBe("1");
    expect(counters.getAttribute("data-rejected")).toBe("0");
  });

  it("summarizeLearningLive counts loops by terminal status (honest, from events)", () => {
    const s = summarizeLearningLive(LEARNING_EVENT_FIXTURE);
    expect(s.total).toBe(2);
    expect(s.verified).toBe(1);
    expect(s.rejected).toBe(1);
  });

  it("empty learning stays honest empty (no fixtures injected)", () => {
    expect(projectLearningLoopItems([])).toEqual([]);
    expect(summarizeLearningLive([])).toEqual({ total: 0, verified: 0, rejected: 0, active: 0 });
  });
});

describe("LINE O — memory candidate live/empty fidelity", () => {
  it("project records carry the suggested/observed-false note (honest, no fake write)", () => {
    const items = projectMemoryCandidatesFromProjectRecords([
      { missionId: "m-1", title: "proj one" },
    ]);
    expect(items[0]!.observed).toBe(false);
    expect(items[0]!.status).toBe("suggested");
    expect(items[0]!.note).toContain("observed:false");
  });

  it("empty project records → empty memory candidates", () => {
    expect(projectMemoryCandidatesFromProjectRecords([])).toEqual([]);
  });
});

describe("LINE N/O — read-only invariants hold after polish", () => {
  it("no buttons, no approve/enable, no callback on mount in live mode", () => {
    const spy = vi.fn();
    const { container } = render(
      <div onClick={spy}>
        <AssistantInboxContainer
          live={{
            learningEvents: LEARNING_EVENT_FIXTURE,
            projectRecords: [{ missionId: "m-1", title: "real project" }],
          }}
        />
      </div>,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
    const text = (container.textContent ?? "").toLowerCase();
    expect(/approve/.test(text)).toBe(false);
    expect(/enable/.test(text)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fixture stays labeled example; live learning labeled live", () => {
    render(
      <AssistantInboxContainer live={{ learningEvents: LEARNING_EVENT_FIXTURE }} />,
    );
    expect(
      screen.getByTestId("assistant-inbox-section-learning").getAttribute("data-source"),
    ).toBe("live");
  });
});
