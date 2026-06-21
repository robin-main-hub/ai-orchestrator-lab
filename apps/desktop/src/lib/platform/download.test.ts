import { afterEach, describe, expect, it, vi } from "vitest";
import { browserDownloadAdapter, platformDownload } from "./download";

// The download adapter is the OS's one text-export side door, but it was never
// characterized. Two authority facts matter: (1) HONESTY — it refuses to
// fabricate a download when there is no browser-like runtime (document/URL/Blob
// missing); it throws rather than silently no-op'ing, so a caller never believes
// a file was saved when nothing happened. (2) NO-LEAK — on the happy path it
// wires the anchor from a *fresh* object URL, applies the default mimeType when
// none is given, clicks+removes the transient anchor, and revokes every object
// URL it created (no dangling blob handles). The package's default test env is
// node (document is undefined), which is exactly the "no browser" case; the happy
// path stubs a minimal DOM. Pin both, self-consistent (the Blob is real, so its
// type/text are read back from what the adapter actually constructed).
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browserDownloadAdapter — honesty guard (no fake download outside a browser)", () => {
  it("throws instead of silently no-op'ing when there is no browser-like runtime (document undefined)", () => {
    expect(typeof document).toBe("undefined"); // node test env = the 'no browser' case
    expect(() => browserDownloadAdapter.downloadTextFile({ fileName: "x.txt", body: "hi" })).toThrow(
      "requires a browser-like runtime",
    );
  });

  it("platformDownload is the single default binding to the browser adapter", () => {
    expect(platformDownload).toBe(browserDownloadAdapter);
  });
});

describe("browserDownloadAdapter — happy path wiring + no-leak cleanup (stubbed DOM)", () => {
  function stubDom() {
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    const createElement = vi.fn(() => anchor);
    vi.stubGlobal("document", { createElement, body: { append } });
    const created: string[] = [];
    const revoked: string[] = [];
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);
      const url = `blob:mock/${blobs.length}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
      revoked.push(url);
    });
    return { anchor, append, createElement, created, revoked, blobs };
  }

  it("wires anchor href/download from a fresh object URL, defaults the mimeType, and revokes the URL (no leak)", async () => {
    const dom = stubDom();
    browserDownloadAdapter.downloadTextFile({ fileName: "report.md", body: "# hi" });

    expect(dom.createElement).toHaveBeenCalledWith("a");
    expect(dom.anchor.download).toBe("report.md");
    expect(dom.anchor.href).toBe(dom.created[0]); // href is exactly the object URL just created
    expect(dom.append).toHaveBeenCalledWith(dom.anchor); // appended to the document body
    expect(dom.anchor.click).toHaveBeenCalledTimes(1);
    expect(dom.anchor.remove).toHaveBeenCalledTimes(1); // transient anchor removed
    expect(dom.revoked).toEqual(dom.created); // every created URL is revoked — no dangling handle

    expect(dom.blobs[0]!.type).toBe("text/plain;charset=utf-8"); // default mimeType
    expect(await dom.blobs[0]!.text()).toBe("# hi"); // the body the adapter actually wrote
  });

  it("honors an explicit mimeType without altering the body", async () => {
    const dom = stubDom();
    browserDownloadAdapter.downloadTextFile({ fileName: "data.json", body: "{}", mimeType: "application/json" });
    expect(dom.blobs[0]!.type).toBe("application/json");
    expect(await dom.blobs[0]!.text()).toBe("{}");
    expect(dom.revoked).toEqual(dom.created); // still no leak
  });
});
