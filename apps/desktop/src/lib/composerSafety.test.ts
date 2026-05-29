import { describe, expect, it } from "vitest";
import { getCanSend } from "./composerSafety";
import type { WorkbenchAgent } from "../types";

describe("composerSafety - canSend logic", () => {
  const mockAgent = {
    id: "agent_orchestrator",
    name: "Orchestrator",
    role: "orchestrator",
    modelId: "gpt-4",
  } as unknown as WorkbenchAgent;

  it("should return false if no agent is selected", () => {
    const canSend = getCanSend({
      selectedAgent: undefined,
      isStreaming: false,
      draftMessage: "Hello",
      draftAttachments: [],
    });
    expect(canSend).toBe(false);
  });

  it("should return false if the application is streaming", () => {
    const canSend = getCanSend({
      selectedAgent: mockAgent,
      isStreaming: true,
      draftMessage: "Hello",
      draftAttachments: [],
    });
    expect(canSend).toBe(false);
  });

  it("should return false if message is empty and there are no attachments", () => {
    const canSend = getCanSend({
      selectedAgent: mockAgent,
      isStreaming: false,
      draftMessage: "   ",
      draftAttachments: [],
    });
    expect(canSend).toBe(false);
  });

  it("should return true if message is not empty and not streaming", () => {
    const canSend = getCanSend({
      selectedAgent: mockAgent,
      isStreaming: false,
      draftMessage: "Hello",
      draftAttachments: [],
    });
    expect(canSend).toBe(true);
  });

  it("should return true if message is empty but there are attachments", () => {
    const canSend = getCanSend({
      selectedAgent: mockAgent,
      isStreaming: false,
      draftMessage: "",
      draftAttachments: [
        {
          id: "att_1",
          name: "test.txt",
          kind: "document",
          mimeType: "text/plain",
          size: 123,
          storage: "metadata_only",
        },
      ],
    });
    expect(canSend).toBe(true);
  });
});
