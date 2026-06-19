import { describe, expect, it } from "vitest";
import {
  DGX02_LAN_ORCHESTRATOR_BASE_URL,
  normalizeDgxServerBaseUrl,
  resolveConfiguredDgxServerBaseUrls,
  resolveDgxServerBaseUrls,
} from "./stage30DgxEndpoints";

// Characterization tests for the DGX replica/endpoint resolver (no behavior
// change, no network). These pin the pure normalize + dedupe + fallback
// ordering used to resolve the authoritative/replica server base URLs.
describe("stage30 DGX endpoint resolver", () => {
  it("trims whitespace and strips a single trailing slash", () => {
    expect(normalizeDgxServerBaseUrl("  http://dgx-02:4317/  ")).toBe("http://dgx-02:4317");
    expect(normalizeDgxServerBaseUrl("http://dgx-02:4317")).toBe("http://dgx-02:4317");
  });

  it("removes only the last trailing slash, not internal ones", () => {
    expect(normalizeDgxServerBaseUrl("http://host/base//")).toBe("http://host/base/");
  });

  it("normalizes and dedupes array candidates while preserving order", () => {
    expect(
      resolveDgxServerBaseUrls(["http://a:1/", "http://a:1", "http://b:2"]),
    ).toEqual(["http://a:1", "http://b:2"]);
    expect(resolveDgxServerBaseUrls(["http://b:2", "http://a:1"])).toEqual([
      "http://b:2",
      "http://a:1",
    ]);
  });

  it("wraps a single non-empty string into a one-element normalized list", () => {
    expect(resolveDgxServerBaseUrls("http://single:1/")).toEqual(["http://single:1"]);
  });

  it("drops empty/whitespace candidates and collapses duplicates", () => {
    expect(
      resolveDgxServerBaseUrls(["http://a:1", "", "  ", "http://a:1/"]),
    ).toEqual(["http://a:1"]);
  });

  it("falls back to the configured list (always including the LAN default) for empty input", () => {
    const fromEmpty = resolveDgxServerBaseUrls("");
    const fromWhitespace = resolveDgxServerBaseUrls("   ");
    const fromUndefined = resolveDgxServerBaseUrls(undefined);

    expect(fromEmpty).toEqual(fromUndefined);
    expect(fromWhitespace).toEqual(fromUndefined);
    expect(fromUndefined).toContain(DGX02_LAN_ORCHESTRATOR_BASE_URL);
    expect(resolveConfiguredDgxServerBaseUrls()).toContain(DGX02_LAN_ORCHESTRATOR_BASE_URL);
    for (const url of fromUndefined) {
      expect(url).toBe(url.trim());
      expect(url.endsWith("/")).toBe(false);
    }
  });
});
