import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("App previewUrl wiring smoke", () => {
  it("stores observed previews per missionId and passes only the current mission's URL/meta into ConversationWorkbench", () => {
    // per-mission map (no single 'last observed' that could leak a stale URL across missions)
    expect(appSource).toContain("const [activePreviewRefByMissionId, setActivePreviewRefByMissionId]");
    expect(appSource).toContain("const handlePreviewObserved = useCallback");
    expect(appSource).toContain("setActivePreviewRefByMissionId((prev) => putPreviewRef(prev, ref))");
    expect(appSource).toContain("onPreviewObserved: handlePreviewObserved");
    // ChatSidePanel preview resolves by the CURRENT session's mission only
    expect(appSource).toContain("const currentMissionPreviewRef = resolvePreviewRef(");
    expect(appSource).toContain("missionIdBySourceSessionId[activeSessionId]");
    expect(appSource).toContain("previewUrl={currentMissionPreviewRef?.url}");
  });
});
