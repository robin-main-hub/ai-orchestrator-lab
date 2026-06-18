// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";
import type { EvidenceDraftInput } from "../../lib/evidenceDraft";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

afterEach(() => cleanup());

const draft: EvidenceDraftInput = {
  id: "draft-map-v2",
  title: "relationship draft",
  sources: [
    { id: "ev-map", label: "mapped evidence", observedAt: "2026-06-18T10:00:00.000Z" },
  ],
  claims: [{ id: "claim-map", text: "mapped claim", refs: ["ev-map"] }],
};

const mappedCandidate: WorkItemCandidateInput = {
  id: "wic-map-v2",
  title: "mapped candidate",
  kind: "patch",
  lane: "now",
  status: "blocked",
  risk: "high",
  sourceRefs: ["source-map"],
  evidenceRefs: ["ev-map"],
  reason: "patch safety blocked",
  observed: true,
  createdAt: "2026-06-18T12:00:00.000Z",
};

const emptyCandidate: WorkItemCandidateInput = {
  id: "wic-map-empty",
  title: "empty map candidate",
  kind: "memory",
  lane: "watch",
  status: "candidate",
  risk: "low",
  reason: "memory signal",
};

function openCandidate(id: string) {
  fireEvent.click(screen.getByTestId(`wic-row-${id}`));
}

describe("E11 PR2 — WorkItem Candidate detail tabs and relationship map V2", () => {
  it("renders local-detail tabs and keeps existing detail sections mounted", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: draft, workItemCandidates: [mappedCandidate] }}
      />,
    );

    openCandidate("wic-map-v2");

    const tabs = screen.getByTestId("wic-detail-tabs");
    expect(tabs.getAttribute("data-active-tab")).toBe("overview");
    expect(screen.getByTestId("wic-detail-panel-overview").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("wic-link-graph")).toBeTruthy();
    expect(screen.getByTestId("wic-readiness-section")).toBeTruthy();
    expect(screen.getByTestId("wic-next-step-preview")).toBeTruthy();

    fireEvent.click(screen.getByTestId("wic-detail-tab-map"));

    expect(tabs.getAttribute("data-active-tab")).toBe("map");
    expect(screen.getByTestId("wic-detail-panel-map").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("wic-detail-tab-map").getAttribute("data-action-scope")).toBe(
      "local-detail",
    );
  });

  it("shows a ref-only relationship map with candidate, refs, draft claim, readiness, and preview state", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: draft, workItemCandidates: [mappedCandidate] }}
      />,
    );

    openCandidate("wic-map-v2");
    fireEvent.click(screen.getByTestId("wic-detail-tab-map"));

    const map = screen.getByTestId("wic-relationship-map-v2");
    expect(map.getAttribute("data-source-count")).toBe("1");
    expect(map.getAttribute("data-evidence-count")).toBe("1");
    expect(map.getAttribute("data-draft-count")).toBe("1");
    expect(screen.getByTestId("wic-map-v2-candidate").textContent).toContain("mapped candidate");
    expect(screen.getByTestId("wic-map-v2-source-0").textContent).toContain("source-map");
    expect(screen.getByTestId("wic-map-v2-source-0").textContent).toContain("ref only");
    expect(screen.getByTestId("wic-map-v2-evidence-0").textContent).toContain("ev-map");
    expect(screen.getByTestId("wic-map-v2-draft-ev-map").textContent).toContain("claim-map");
    expect(screen.getByTestId("wic-map-v2-readiness").textContent).toContain("blocked");
    expect(screen.getByTestId("wic-map-v2-preview").textContent).toContain("preview only");
  });

  it("degrades missing refs honestly in the relationship map", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [emptyCandidate] }} />);

    openCandidate("wic-map-empty");
    fireEvent.click(screen.getByTestId("wic-detail-tab-map"));

    const map = screen.getByTestId("wic-relationship-map-v2");
    expect(map.getAttribute("data-source-count")).toBe("0");
    expect(map.getAttribute("data-evidence-count")).toBe("0");
    expect(map.getAttribute("data-draft-count")).toBe("0");
    expect(screen.getByTestId("wic-map-v2-source-empty").textContent).toContain("none / unknown");
    expect(screen.getByTestId("wic-map-v2-evidence-empty").textContent).toContain("none / unknown");
    expect(screen.getByTestId("wic-map-v2-draft-empty").textContent).toContain("no matching draft evidence");
  });

  it("keeps tabs and map read-only with only local-detail controls", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: draft, workItemCandidates: [mappedCandidate] }}
      />,
    );

    openCandidate("wic-map-v2");
    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");

    assertNoSideEffectActionControls(drawer);
    assertNoForbiddenActionText(drawer);
    for (const control of collectActionControls(drawer)) {
      expect(control.getAttribute("data-action-scope")).toBe("local-detail");
    }
    expect((drawer.textContent ?? "").toLowerCase()).not.toMatch(
      /create work item|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });
});
