// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { AssistantInbox } from "./AssistantInbox";
import { EvidenceCard, type EvidenceItem } from "./EvidenceCard";
import { LearningLoopCard, type LearningLoopItem } from "./LearningLoopCard";
import { MemoryCandidateCard, type MemoryCandidateItem } from "./MemoryCandidateCard";
import {
  RuntimeManifestPreviewCard,
  type ManifestEntry,
} from "./RuntimeManifestPreviewCard";

afterEach(() => cleanup());

const evidence: EvidenceItem[] = [
  {
    id: "e1",
    title: "build passed",
    verdict: "pass",
    summary: "exit 0",
    observed: true,
    refs: [
      { id: "r1", label: "ci.log", locator: "L1-20" },
      { id: "r2", label: "build.sh" },
    ],
  },
  {
    id: "e2",
    title: "lint drift",
    verdict: "warning",
    refs: [{ id: "r3", label: "eslint" }],
  },
  {
    id: "e3",
    title: "secret leak",
    verdict: "blocked",
    observed: false,
    refs: [{ id: "r4", label: "scan" }],
  },
];

const loops: LearningLoopItem[] = [
  { id: "l1", title: "flaky test", stage: "investigating" },
  { id: "l2", title: "race fix", stage: "verified" },
  { id: "l3", title: "bad hypothesis", stage: "rejected" },
];

const memory: MemoryCandidateItem[] = [
  { id: "m1", title: "use quant eval", status: "written", origin: "learning_loop", observed: true },
  { id: "m2", title: "maybe pattern", status: "suggested", origin: "evidence_bridge", observed: false },
];

const manifest: ManifestEntry[] = [
  { id: "s1", name: "skill.alpha", loadable: true },
  { id: "s2", name: "skill.beta", loadable: true, evalWarned: true },
  { id: "s3", name: "skill.gamma", loadable: false, reason: "eval_failed" },
  { id: "s4", name: "skill.delta", loadable: false, reason: "quarantined" },
];

describe("AssistantInbox shell", () => {
  it("renders all four sections with counts and a total", () => {
    render(
      <AssistantInbox
        evidence={evidence}
        learningLoops={loops}
        memoryCandidates={memory}
        manifestEntries={manifest}
      />,
    );
    expect(screen.getByTestId("assistant-inbox").getAttribute("data-total")).toBe(
      String(evidence.length + loops.length + memory.length + manifest.length),
    );
    expect(screen.getByTestId("assistant-inbox-section-evidence").getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("assistant-inbox-section-learning").getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("assistant-inbox-section-memory").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("assistant-inbox-section-manifest").getAttribute("data-count")).toBe("4");
  });

  it("renders empty hints for empty sections (defaults to no items)", () => {
    render(<AssistantInbox />);
    expect(screen.getByTestId("assistant-inbox-section-empty-evidence")).toBeTruthy();
    expect(screen.getByTestId("assistant-inbox-section-empty-learning")).toBeTruthy();
    expect(screen.getByTestId("assistant-inbox-section-empty-memory")).toBeTruthy();
    expect(screen.getByTestId("assistant-inbox").getAttribute("data-total")).toBe("0");
  });

  it("exposes NO approve/enable/run control anywhere (read-only surface)", () => {
    const { container } = render(
      <AssistantInbox
        evidence={evidence}
        learningLoops={loops}
        memoryCandidates={memory}
        manifestEntries={manifest}
      />,
    );
    // no buttons at all in this presentational surface
    assertNoSideEffectActionControls(container);
    const text = container.textContent ?? "";
    expect(/approve/i.test(text)).toBe(false);
    expect(/enable/i.test(text)).toBe(false);
  });

  it("does not fire any callback on mount (no auto action)", () => {
    // The inbox accepts no callbacks; assert via a spy passed through any
    // surface that mounting touches nothing. We simulate by spying console.
    const spy = vi.fn();
    render(
      <div onClick={spy}>
        <AssistantInbox evidence={evidence} manifestEntries={manifest} />
      </div>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("EvidenceCard", () => {
  it("renders pass/warning/blocked verdict badges with data-verdict", () => {
    render(
      <div>
        {evidence.map((e) => (
          <EvidenceCard key={e.id} item={e} />
        ))}
      </div>,
    );
    expect(screen.getByTestId("evidence-verdict-e1").getAttribute("data-verdict")).toBe("pass");
    expect(screen.getByTestId("evidence-verdict-e2").getAttribute("data-verdict")).toBe("warning");
    expect(screen.getByTestId("evidence-verdict-e3").getAttribute("data-verdict")).toBe("blocked");
  });

  it("shows source refs (footnotes) visibly", () => {
    render(<EvidenceCard item={evidence[0]!} />);
    const refs = screen.getByTestId("evidence-refs-e1");
    expect(refs.getAttribute("data-ref-count")).toBe("2");
    expect(within(refs).getByText("ci.log")).toBeTruthy();
    expect(within(refs).getByText("L1-20")).toBeTruthy();
    expect(within(refs).getByText("build.sh")).toBeTruthy();
  });

  it("renders observed:false honestly without a fake pass", () => {
    render(<EvidenceCard item={evidence[2]!} />);
    const card = screen.getByTestId("evidence-card-e3");
    expect(card.getAttribute("data-observed")).toBe("false");
    expect(screen.getByTestId("evidence-observed-e3").textContent).toContain("not observed");
    // blocked verdict still blocked — not flipped to pass
    expect(screen.getByTestId("evidence-verdict-e3").getAttribute("data-verdict")).toBe("blocked");
  });

  it("renders an empty-refs marker when no refs given", () => {
    render(<EvidenceCard item={{ id: "x", title: "t", verdict: "pass" }} />);
    expect(screen.getByTestId("evidence-refs-empty-x")).toBeTruthy();
  });
});

describe("LearningLoopCard", () => {
  it("renders the stage badge and full progression", () => {
    render(<LearningLoopCard item={loops[0]!} />);
    expect(screen.getByTestId("learning-loop-stage-l1").getAttribute("data-stage")).toBe(
      "investigating",
    );
    expect(screen.getByTestId("learning-loop-step-l1-investigating").getAttribute("data-state")).toBe(
      "current",
    );
    expect(screen.getByTestId("learning-loop-step-l1-failed").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("learning-loop-step-l1-verified").getAttribute("data-state")).toBe(
      "pending",
    );
  });

  it("marks rejected as a terminal off-track stage", () => {
    render(<LearningLoopCard item={loops[2]!} />);
    expect(screen.getByTestId("learning-loop-card-l3").getAttribute("data-terminal")).toBe("rejected");
    expect(screen.getByTestId("learning-loop-rejected-l3")).toBeTruthy();
  });
});

describe("MemoryCandidateCard", () => {
  it("renders status, origin, and honest observed badges", () => {
    render(<MemoryCandidateCard item={memory[0]!} />);
    expect(screen.getByTestId("memory-status-m1").getAttribute("data-status")).toBe("written");
    expect(screen.getByTestId("memory-origin-m1").getAttribute("data-origin")).toBe("learning_loop");
    expect(screen.getByTestId("memory-observed-m1").getAttribute("data-observed")).toBe("true");
  });

  it("renders observed:false honestly", () => {
    render(<MemoryCandidateCard item={memory[1]!} />);
    const obs = screen.getByTestId("memory-observed-m2");
    expect(obs.getAttribute("data-observed")).toBe("false");
    expect(obs.textContent).toContain("not observed");
  });
});

describe("RuntimeManifestPreviewCard", () => {
  it("splits loadable vs blocked with reasons, and shows no enable control", () => {
    const { container } = render(<RuntimeManifestPreviewCard entries={manifest} />);
    expect(screen.getByTestId("runtime-manifest-card").getAttribute("data-loadable")).toBe("2");
    expect(screen.getByTestId("runtime-manifest-card").getAttribute("data-blocked")).toBe("2");
    expect(screen.getByTestId("runtime-manifest-state-s3").getAttribute("data-loadable")).toBe("false");
    expect(screen.getByTestId("runtime-manifest-reason-s3").getAttribute("data-reason")).toBe(
      "eval_failed",
    );
    expect(screen.getByTestId("runtime-manifest-reason-s4").getAttribute("data-reason")).toBe(
      "quarantined",
    );
    // blocked entries never get an enable/approve button
    assertNoSideEffectActionControls(container);
  });

  it("shows evalWarned badge on a loadable-but-warned entry", () => {
    render(<RuntimeManifestPreviewCard entries={manifest} />);
    expect(screen.getByTestId("runtime-manifest-evalwarned-s2").getAttribute("data-eval-warned")).toBe(
      "true",
    );
    // a clean loadable entry has no eval-warned badge
    expect(screen.queryByTestId("runtime-manifest-evalwarned-s1")).toBeNull();
  });

  it("renders an empty marker for no entries", () => {
    render(<RuntimeManifestPreviewCard entries={[]} />);
    expect(screen.getByTestId("runtime-manifest-empty")).toBeTruthy();
  });
});
