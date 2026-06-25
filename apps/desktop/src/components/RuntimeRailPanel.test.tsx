import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RuntimeRailPanel } from "./RuntimeRailPanel";
import { runtimeSnapshot } from "../seeds/runtime";

/**
 * RuntimeRailPanel powers two surfaces: the sessions page (full controls) and the
 * read-only system.runtime shell surface (reboot control absent). The reboot
 * request is the only node-mutation entry point, so it must disappear when no
 * handler is wired — that is what makes the read-only surface genuinely read-only.
 */
describe("RuntimeRailPanel reboot control gating", () => {
  it("omits the node reboot control when onRequestReboot is not provided", () => {
    const html = renderToStaticMarkup(
      <RuntimeRailPanel onProbeDgx={() => {}} rebootWatchdogs={[]} snapshot={runtimeSnapshot} />,
    );
    expect(html).not.toContain("재시작 승인");
    // Still renders the runtime nodes read-only (status comes from the snapshot).
    expect(html).toContain("DGX-02");
  });

  it("keeps the node reboot control when onRequestReboot is provided (sessions page)", () => {
    const html = renderToStaticMarkup(
      <RuntimeRailPanel
        onProbeDgx={() => {}}
        onRequestReboot={() => {}}
        rebootWatchdogs={[]}
        snapshot={runtimeSnapshot}
      />,
    );
    expect(html).toContain("재시작 승인");
  });
});
