import { describe, expect, it } from "vitest";
import {
  deriveKokoroBaseUrl,
  voicePresetForRole,
  KOKORO_DEFAULT_BASE_URL,
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
