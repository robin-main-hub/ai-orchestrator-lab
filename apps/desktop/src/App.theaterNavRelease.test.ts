import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("App theater nav release wiring", () => {
  it("handleOpenDelegatedAgentConversation releases center nav after switching to conversation", () => {
    const handler = appSource.slice(
      appSource.indexOf("function handleOpenDelegatedAgentConversation"),
      appSource.indexOf("function handleProgressMakimaDelegationAssignment"),
    );
    expect(handler).toContain('setMode("conversation")');
    expect(handler).toContain("setActiveNavItem(MODE_OWNS_CENTER_NAV)");
    // nav 해제는 setMode 이후에 위치(previousModeRef 조기 반환 회피)
    expect(handler.indexOf("setActiveNavItem(MODE_OWNS_CENTER_NAV)")).toBeGreaterThan(
      handler.indexOf('setMode("conversation")'),
    );
  });
});
