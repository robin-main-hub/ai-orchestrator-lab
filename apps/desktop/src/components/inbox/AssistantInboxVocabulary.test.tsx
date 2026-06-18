// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";
import { INBOX_VOCAB } from "../../lib/inboxVocabulary";

afterEach(() => cleanup());

// Batch 27 — Launch Key / Commit Point UX: the read-only inbox adopts a centralized
// operator vocabulary (commit-point framing) WITHOUT changing any behavior.

describe("Batch 27 — inbox vocabulary applied (labels only)", () => {
  it("the header read-only note uses the centralized vocab (no-execution preserved)", () => {
    render(<AssistantInboxContainer />); // PREVIEW
    const note = screen.getByTestId("assistant-inbox-readonly-note");
    expect(note.textContent).toBe(INBOX_VOCAB.readOnlyNote);
    expect(note.textContent).toContain("read-only");
  });

  it("the patch candidate lane caption adopts the commit-point framing", () => {
    render(<AssistantInboxContainer />); // PREVIEW supplies EXAMPLE_PATCH_CANDIDATES
    const caption = screen.getByTestId("patch-lane-caption");
    expect(caption.textContent).toBe(INBOX_VOCAB.patchLaneCaption);
    expect(caption.textContent).toContain("commit point");
    // the lane itself is unchanged (same testid, still rendered)
    expect(screen.getByTestId("patch-candidate-lane")).toBeTruthy();
  });

  it("relabelling introduces no side-effect control or forbidden action text", () => {
    render(<AssistantInboxContainer />);
    const inbox = screen.getByTestId("assistant-inbox");
    assertNoSideEffectActionControls(inbox);
    assertNoForbiddenActionText(screen.getByTestId("patch-candidate-lane"));
    assertNoForbiddenActionText(screen.getByTestId("assistant-inbox-readonly-note"));
  });
});
