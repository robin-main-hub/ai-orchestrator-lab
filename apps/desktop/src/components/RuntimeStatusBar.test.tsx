import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { RuntimeStatusBar } from "./RuntimeStatusBar";

const snapshot: RuntimeSnapshot = {
  activeProviderProfileId: "provider_mimo",
  dgxStatus: "online",
  updatedAt: "2026-06-06T00:00:00.000Z",
  localModelStatus: "online",
  memorySyncStatus: "online",
  status: "online",
  syncTopology: {
    authorityNodeId: "dgx-02",
    authorityLabel: "MacBook authority",
    conflictPolicy: "manual_review",
    clients: [],
    eventStoreMode: "dgx02_authoritative_with_client_cache",
    offlineWritePolicy: "append_local_outbox_when_offline",
  },
  localModels: [],
  recentError: undefined,
  runtimeNodes: [
    {
      id: "dgx-02",
      isPrimary: true,
      label: "DGX-02",
      models: [],
      role: "main_server",
      status: "online",
    },
  ],
};

describe("RuntimeStatusBar", () => {
  it("renders the current view title plus Korean command and health labels", () => {
    const html = renderToStaticMarkup(
      <RuntimeStatusBar
        drawerAvailable
        mode="conversation"
        onChangeMode={vi.fn()}
        onCommandPalette={vi.fn()}
        onOpenOpsDetail={vi.fn()}
        onProbeDgx={vi.fn()}
        onToggleDrawer={vi.fn()}
        providerName="MiMo"
        snapshot={snapshot}
        viewTitle="대화"
      />,
    );

    // single-rail topbar: only the current view title, no mode-pill deck
    expect(html).toContain("대화");
    expect(html).toContain("명령");
    expect(html).toContain("상태");
    expect(html).not.toContain("Conversation");
    expect(html).not.toContain("Command");
    expect(html).not.toContain("Health");
  });

  it("uses Korean provider fallback copy in the health popover", () => {
    const html = renderToStaticMarkup(
      <RuntimeStatusBar
        drawerAvailable
        mode="conversation"
        onChangeMode={vi.fn()}
        onCommandPalette={vi.fn()}
        onOpenOpsDetail={vi.fn()}
        onProbeDgx={vi.fn()}
        onToggleDrawer={vi.fn()}
        providerName=""
        snapshot={snapshot}
        viewTitle="대화"
      />,
    );

    expect(html).toContain("공급자 미지정");
    expect(html).not.toContain("Provider 미지정");
  });
});
