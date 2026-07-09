import { describe, expect, it } from "vitest";
import {
  addApprovedPrefix,
  approvedPrefixCandidate,
  codingApprovalConfig,
  isAutoMode,
  isCodingApprovalMode,
  parseStoredApprovalMode,
  parseStoredApprovedPrefixes,
  removeApprovedPrefix,
  shouldShowAutoApprovalWarning,
} from "./codingAutoApproval";

describe("codingAutoApproval", () => {
  it("기본값은 guided_auto(full-auto), 잘못된 값도 기본으로 fallback, 명시 저장 값은 존중", () => {
    // 저장된 값이 없으면 full-auto 기본(guided_auto)
    expect(parseStoredApprovalMode(null)).toBe("guided_auto");
    expect(parseStoredApprovalMode(undefined)).toBe("guided_auto");
    expect(parseStoredApprovalMode("nope")).toBe("guided_auto");
    // 명시적으로 저장된 값은 그대로 존중(기본으로 덮어쓰지 않음)
    expect(parseStoredApprovalMode("manual")).toBe("manual");
    expect(parseStoredApprovalMode("auto_safe")).toBe("auto_safe");
    expect(parseStoredApprovalMode("session_allow")).toBe("session_allow");
    expect(parseStoredApprovalMode("guided_auto")).toBe("guided_auto");
    expect(isCodingApprovalMode("auto_safe")).toBe(true);
    expect(isCodingApprovalMode("legacy")).toBe(false);
  });

  it("자동 모드 식별 + 첫 arm 경고는 ARMed 전에만", () => {
    expect(isAutoMode("manual")).toBe(false);
    expect(isAutoMode("auto_safe")).toBe(true);
    expect(shouldShowAutoApprovalWarning("manual", null)).toBe(false);
    expect(shouldShowAutoApprovalWarning("auto_safe", null)).toBe(true);
    expect(shouldShowAutoApprovalWarning("auto_safe", "2026-06-14T00:00:00.000Z")).toBe(false); // 한 번 ARM되면 다시 안 뜸
    expect(shouldShowAutoApprovalWarning("guided_auto", null)).toBe(true);
  });

  it("모드별 전략 구성 — manual은 전부 off, guided_auto만 위험제외 자동 true", () => {
    expect(codingApprovalConfig("manual")).toEqual({ autonomyMode: "human", autoApproveAll: false, patternPrefixesEnabled: false });
    expect(codingApprovalConfig("auto_safe")).toEqual({ autonomyMode: "auto_safe", autoApproveAll: false, patternPrefixesEnabled: false });
    expect(codingApprovalConfig("session_allow")).toEqual({ autonomyMode: "human", autoApproveAll: false, patternPrefixesEnabled: true });
    expect(codingApprovalConfig("guided_auto")).toEqual({ autonomyMode: "auto_safe", autoApproveAll: true, patternPrefixesEnabled: true });
  });

  it("계열 prefix 추가는 실제 명령 기반 — 위험 명령은 추가 불가", () => {
    expect(approvedPrefixCandidate("pnpm test")).toEqual({ prefix: "pnpm test", canAdd: true });
    expect(approvedPrefixCandidate("ls -la")).toEqual({ prefix: "ls", canAdd: true });
    const danger = approvedPrefixCandidate("rm -rf node_modules");
    expect(danger.canAdd).toBe(false);
    expect(danger.blockedReason).toContain("위험");
    const push = approvedPrefixCandidate("git push origin main");
    expect(push.canAdd).toBe(false);
    // summary/reason text 같은 비명령 입력은 prefix가 비어 추가 불가
    expect(approvedPrefixCandidate("   ").canAdd).toBe(false);
  });

  it("add/remove는 중복 없이 적용, 위험 명령은 무시", () => {
    const after = addApprovedPrefix([], "pnpm test");
    expect(after).toEqual(["pnpm test"]);
    expect(addApprovedPrefix(after, "pnpm test")).toEqual(["pnpm test"]); // 중복 방지
    expect(addApprovedPrefix(after, "rm -rf /")).toEqual(["pnpm test"]); // 위험 무시
    expect(removeApprovedPrefix(["pnpm test", "rg"], "pnpm test")).toEqual(["rg"]);
  });

  it("저장된 prefix 파싱은 안전(JSON 깨짐/비배열/긴 목록)", () => {
    expect(parseStoredApprovedPrefixes(null)).toEqual([]);
    expect(parseStoredApprovedPrefixes("oops")).toEqual([]);
    expect(parseStoredApprovedPrefixes(JSON.stringify(["a", "", "b", 3]))).toEqual(["a", "b"]);
  });
});
