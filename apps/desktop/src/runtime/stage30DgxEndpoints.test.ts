import { describe, expect, it } from "vitest";
import {
  DEFAULT_DGX_SERVER_BASE_URL,
  DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS,
  DGX02_LAN_ORCHESTRATOR_BASE_URL,
  ENDRUIN_ORCHESTRATOR_BASE_URL,
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

// Characterization tests for the three previously-unreferenced base-url
// constants (no behavior change, no network, no env stubbing). The suite above
// only imports DGX02_LAN_ORCHESTRATOR_BASE_URL and exercises the resolver; it
// never pins DEFAULT_DGX_SERVER_BASE_URL (the canonical alias), the default
// fallback tuple, or ENDRUIN_ORCHESTRATOR_BASE_URL (the public endpoint that is
// kept OUT of the defaults and only joined via the env-gated public-fallback
// arm — an arm unreachable here because vitest cannot empty/seed import.meta.env
// in this setup). We exercise the constants through the explicit-arg resolver
// path, which is env-independent, rather than the env-sensitive default arm.
describe("stage30 DGX endpoint defaults — base-url constants", () => {
  it("exposes the LAN default as the canonical, already-normalized server base url", () => {
    expect(DGX02_LAN_ORCHESTRATOR_BASE_URL).toBe("http://dgx-02:4317");
    // DEFAULT_DGX_SERVER_BASE_URL is a pure alias of the LAN default.
    expect(DEFAULT_DGX_SERVER_BASE_URL).toBe(DGX02_LAN_ORCHESTRATOR_BASE_URL);
    // already normalized: no whitespace, no trailing slash.
    expect(normalizeDgxServerBaseUrl(DEFAULT_DGX_SERVER_BASE_URL)).toBe(DEFAULT_DGX_SERVER_BASE_URL);
  });

  it("default fallback tuple is exactly the LAN default and excludes the public endpoint", () => {
    expect([...DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS]).toEqual([DGX02_LAN_ORCHESTRATOR_BASE_URL]);
    expect(DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS).not.toContain(ENDRUIN_ORCHESTRATOR_BASE_URL);
    for (const url of DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS) {
      expect(url).toBe(url.trim());
      expect(url.endsWith("/")).toBe(false);
    }
  });

  it("treats the public orchestrator endpoint as a distinct https host kept out of the defaults", () => {
    expect(ENDRUIN_ORCHESTRATOR_BASE_URL).toBe("https://orchestrator.endruin.com");
    // public endpoint uses https; the internal LAN default uses plain http.
    expect(ENDRUIN_ORCHESTRATOR_BASE_URL.startsWith("https://")).toBe(true);
    expect(DGX02_LAN_ORCHESTRATOR_BASE_URL.startsWith("http://")).toBe(true);
    expect(ENDRUIN_ORCHESTRATOR_BASE_URL).not.toBe(DGX02_LAN_ORCHESTRATOR_BASE_URL);
  });

  it("resolves the fallback constant through the env-independent explicit-arg path", () => {
    // explicit array arg bypasses the env-sensitive default arm entirely.
    expect(resolveDgxServerBaseUrls([...DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS])).toEqual([
      DGX02_LAN_ORCHESTRATOR_BASE_URL,
    ]);
    // explicit string arg routes through the same normalize+dedupe pipeline.
    expect(resolveDgxServerBaseUrls(DEFAULT_DGX_SERVER_BASE_URL)).toEqual([
      "http://dgx-02:4317",
    ]);
  });
});
