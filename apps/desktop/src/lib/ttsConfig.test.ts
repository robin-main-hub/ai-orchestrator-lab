import { describe, expect, it } from "vitest";
import {
  deriveKokoroBaseUrl,
  voicePresetForRole,
  KOKORO_DEFAULT_BASE_URL,
  KOKORO_DEFAULT_PORT,
} from "./ttsConfig";

describe("deriveKokoroBaseUrl", () => {
  it("서버 호스트를 재사용하고 포트를 8880으로", () => {
    expect(deriveKokoroBaseUrl("http://dgx-02:7070")).toBe("http://dgx-02:8880");
    expect(deriveKokoroBaseUrl("https://10.0.0.5:443/api")).toBe("https://10.0.0.5:8880");
  });
  it("배열이면 첫 항목 사용", () => {
    expect(deriveKokoroBaseUrl(["http://a:1", "http://b:2"])).toBe("http://a:8880");
  });
  it("스킴 없는 host:port도 처리", () => {
    expect(deriveKokoroBaseUrl("dgx-02:7070")).toBe("http://dgx-02:8880");
  });
  it("없거나 빈 값이면 기본 주소", () => {
    expect(deriveKokoroBaseUrl()).toBe(KOKORO_DEFAULT_BASE_URL);
    expect(deriveKokoroBaseUrl("")).toBe(KOKORO_DEFAULT_BASE_URL);
    expect(deriveKokoroBaseUrl([])).toBe(KOKORO_DEFAULT_BASE_URL);
  });
  it("커스텀 포트 지정", () => {
    expect(deriveKokoroBaseUrl("http://dgx-02:7070", 9999)).toBe("http://dgx-02:9999");
  });
});

// Characterization tests (no behavior change) for the previously-unpinned
// KOKORO_DEFAULT_PORT constant and the two deriveKokoroBaseUrl fallback branches the
// existing cases never reach. The block above hardcodes "8880" and treats
// KOKORO_DEFAULT_BASE_URL as an opaque expected value; it never pins the port literal,
// the default-base-url composition, or what happens when an http(s) input *fails* URL
// parsing. Those uncovered branches matter: deriveKokoroBaseUrl must always yield a
// usable Kokoro address, so when the host can't be extracted it falls back to the
// default dgx-02 host + default port — and on that fallback the original scheme is NOT
// preserved (https → http). These cases pin the constant, its self-consistent
// composition into KOKORO_DEFAULT_BASE_URL, and both empty-host fallbacks (the
// new-URL-throws catch path and the scheme-less no-host path).
describe("KOKORO_DEFAULT_PORT & deriveKokoroBaseUrl fallbacks", () => {
  it("the default port is 8880 and composes the default base url on the dgx-02 host", () => {
    expect(KOKORO_DEFAULT_PORT).toBe(8880);
    // KOKORO_DEFAULT_BASE_URL embeds the default port — derived, not a hand-copied literal
    expect(KOKORO_DEFAULT_BASE_URL).toBe(`http://dgx-02:${KOKORO_DEFAULT_PORT}`);
    // and that is exactly what an absent serverBaseUrl resolves to
    expect(deriveKokoroBaseUrl()).toBe(KOKORO_DEFAULT_BASE_URL);
  });

  it("the host-reuse path swaps in the default port (port literal tied to the const)", () => {
    expect(deriveKokoroBaseUrl("http://dgx-02:7070")).toBe(`http://dgx-02:${KOKORO_DEFAULT_PORT}`);
  });

  it("a malformed http(s) url that fails URL parsing falls back to the default host (scheme dropped)", () => {
    // new URL("http://") throws → catch → empty manual host → default dgx-02 host
    expect(deriveKokoroBaseUrl("http://")).toBe(`http://dgx-02:${KOKORO_DEFAULT_PORT}`);
    // https input loses its scheme on the fallback — the address is always plain http
    expect(deriveKokoroBaseUrl("https://")).toBe(`http://dgx-02:${KOKORO_DEFAULT_PORT}`);
    // honors a custom port even on the fallback
    expect(deriveKokoroBaseUrl("http://", 9001)).toBe("http://dgx-02:9001");
  });

  it("a scheme-less value with no extractable host also falls back to the default host", () => {
    // no scheme → manual extraction yields an empty host → final fallback arm (no catch)
    expect(deriveKokoroBaseUrl("/foo/bar")).toBe(`http://dgx-02:${KOKORO_DEFAULT_PORT}`);
    expect(deriveKokoroBaseUrl(":7070")).toBe(`http://dgx-02:${KOKORO_DEFAULT_PORT}`);
  });
});

describe("voicePresetForRole", () => {
  it("역할별 프리셋 매핑", () => {
    expect(voicePresetForRole("architect")).toBe("architect");
    expect(voicePresetForRole("qa")).toBe("reviewer");
    expect(voicePresetForRole("code")).toBe("executor");
    expect(voicePresetForRole("backend")).toBe("executor");
    expect(voicePresetForRole("orchestrator")).toBe("direct");
    expect(voicePresetForRole("discussion")).toBe("direct");
  });
  it("알 수 없는/누락 역할은 calm", () => {
    expect(voicePresetForRole("memory")).toBe("calm");
    expect(voicePresetForRole(undefined)).toBe("calm");
  });
});
