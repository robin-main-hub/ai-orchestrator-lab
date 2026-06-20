import { describe, expect, it } from "vitest";
import { approvalServerStatusLabel, ingressChannelLabel, ingressPermissionLabel } from "./railStatusLabels";

// Characterization tests for the three railStatusLabels helpers the existing
// railStatusLabels.test.ts leaves uncovered (no behavior change). All are pure
// dictionary lookups over a literal string; the module imports only protocol
// types, no React/DOM/network. ingressChannelLabel and ingressPermissionLabel
// use a `?? value` passthrough fallback for unknown keys, so we pin every
// tabled entry plus an unmapped verbatim passthrough (including empty string).
// approvalServerStatusLabel is keyed by an exhaustive 4-literal union with NO
// fallback arm, so we pin only its four valid inputs.

describe("ingressChannelLabel", () => {
  it("maps every tabled channel to its Korean label", () => {
    expect(ingressChannelLabel("api")).toBe("API");
    expect(ingressChannelLabel("external_legacy")).toBe("외부 레거시");
    expect(ingressChannelLabel("mobile")).toBe("모바일");
    expect(ingressChannelLabel("webhook")).toBe("웹훅");
  });

  it("passes unmapped channels through verbatim", () => {
    expect(ingressChannelLabel("slack")).toBe("slack");
    expect(ingressChannelLabel("")).toBe("");
  });
});

describe("ingressPermissionLabel", () => {
  it("maps every tabled permission to its Korean label", () => {
    expect(ingressPermissionLabel("network_access")).toBe("네트워크 접근");
    expect(ingressPermissionLabel("read_only")).toBe("읽기 전용");
    expect(ingressPermissionLabel("remote_workspace")).toBe("원격 작업공간");
    expect(ingressPermissionLabel("run_dangerous_commands")).toBe("위험 명령 실행");
    expect(ingressPermissionLabel("run_safe_commands")).toBe("안전 명령 실행");
    expect(ingressPermissionLabel("secret_access")).toBe("비밀값 접근");
    expect(ingressPermissionLabel("write_files")).toBe("파일 수정");
  });

  it("passes unmapped permissions through verbatim", () => {
    expect(ingressPermissionLabel("gpu_access")).toBe("gpu_access");
    expect(ingressPermissionLabel("")).toBe("");
  });
});

describe("approvalServerStatusLabel", () => {
  it("maps each of the four union states to its Korean label", () => {
    expect(approvalServerStatusLabel("idle")).toBe("대기");
    expect(approvalServerStatusLabel("loading")).toBe("불러오는 중");
    expect(approvalServerStatusLabel("error")).toBe("오류");
    expect(approvalServerStatusLabel("ready")).toBe("준비됨");
  });
});
