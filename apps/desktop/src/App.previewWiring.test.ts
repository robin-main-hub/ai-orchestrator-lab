import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("App previewUrl wiring smoke", () => {
  it("stores the last observed preview and passes only its URL/meta into ConversationWorkbench", () => {
    expect(appSource).toContain("const [activePreviewRef, setActivePreviewRef]");
    expect(appSource).toContain("const handlePreviewObserved = useCallback");
    expect(appSource).toContain("onPreviewObserved: handlePreviewObserved");
    expect(appSource).toContain("previewUrl={activePreviewRef?.url}");
    expect(appSource).toContain("previewMeta={activePreviewRef ? { missionId: activePreviewRef.missionId, observedAt: activePreviewRef.observedAt } : undefined}");
  });
});
