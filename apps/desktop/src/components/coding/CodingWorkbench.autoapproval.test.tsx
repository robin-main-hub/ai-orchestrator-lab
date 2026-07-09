// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CodingWorkbench } from "./CodingWorkbench";
import { CODING_SESSIONS_STORAGE_KEY } from "../../lib/codingChatStore";
import {
  CODING_APPROVAL_MODE_STORAGE_KEY,
  CODING_APPROVED_PREFIXES_STORAGE_KEY,
  CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY,
} from "../../lib/codingAutoApproval";

afterEach(cleanup);
beforeEach(() => {
  localStorage.removeItem(CODING_SESSIONS_STORAGE_KEY);
  localStorage.removeItem(CODING_APPROVAL_MODE_STORAGE_KEY);
  localStorage.removeItem(CODING_APPROVED_PREFIXES_STORAGE_KEY);
  localStorage.removeItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY);
});

describe("CodingWorkbench 자동승인 (jsdom) — 옵션 명시 활성화 + 첫 켜기 경고", () => {
  it("기본 모드는 자동 진행(guided_auto, full-auto)이며 초기 렌더에 경고 다이얼로그가 뜨지 않는다", () => {
    // 저장된 값이 없으면 full-auto 기본(guided_auto). 기본 진입 시엔 arm 경고를 띄우지 않는다
    // (경고는 사용자가 manual→자동으로 명시 전환할 때만).
    render(<CodingWorkbench />);
    const select = screen.getByDisplayValue("자동 진행") as HTMLSelectElement;
    expect(select.value).toBe("guided_auto");
    expect(screen.queryByRole("dialog", { name: /자동승인 활성화/ })).toBeNull();
  });

  it("manual에서 자동 모드로 바꾸면 위험 경고 다이얼로그가 뜨고, 확인 전엔 모드가 바뀌지 않는다", () => {
    // 명시 저장된 manual에서 시작(기본은 이제 guided_auto이므로 전환 플로우는 manual 시드로 검증)
    localStorage.setItem(CODING_APPROVAL_MODE_STORAGE_KEY, "manual");
    render(<CodingWorkbench />);
    const select = screen.getByDisplayValue("사람 승인") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "auto_safe" } });

    const dialog = screen.getByRole("dialog", { name: /자동승인 활성화/ });
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("자동승인");
    expect(dialog.textContent).toContain("위험"); // 위험 경고 포함
    expect(dialog.textContent).toContain("정말로 자동승인을 활성화하시겠어요?");
    // 아직 확인 안 했으므로 실제 모드는 manual 그대로(ARMed 저장 안 됨)
    expect(localStorage.getItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CODING_APPROVAL_MODE_STORAGE_KEY) ?? "manual").toBe("manual");
  });

  it("취소하면 자동승인이 활성화되지 않고 manual 그대로", () => {
    localStorage.setItem(CODING_APPROVAL_MODE_STORAGE_KEY, "manual");
    render(<CodingWorkbench />);
    fireEvent.change(screen.getByDisplayValue("사람 승인"), { target: { value: "guided_auto" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog", { name: /자동승인 활성화/ })).toBeNull();
    expect(localStorage.getItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY)).toBeNull();
    expect((screen.getByDisplayValue("사람 승인") as HTMLSelectElement).value).toBe("manual");
  });

  it("확인하면 ARMed 시각이 저장되고 모드가 적용된다", () => {
    localStorage.setItem(CODING_APPROVAL_MODE_STORAGE_KEY, "manual");
    render(<CodingWorkbench />);
    fireEvent.change(screen.getByDisplayValue("사람 승인"), { target: { value: "auto_safe" } });
    fireEvent.click(screen.getByRole("button", { name: /이해했고 활성화/ }));
    expect(localStorage.getItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY)).toMatch(/T/); // ISO 시각 저장
    expect(localStorage.getItem(CODING_APPROVAL_MODE_STORAGE_KEY)).toBe("auto_safe");
  });

  it("이미 ARMed면 다른 자동 모드로 바꿔도 경고 다이얼로그가 다시 뜨지 않는다", () => {
    localStorage.setItem(CODING_APPROVAL_MODE_STORAGE_KEY, "manual");
    localStorage.setItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY, "2026-06-14T00:00:00.000Z");
    render(<CodingWorkbench />);
    fireEvent.change(screen.getByDisplayValue("사람 승인"), { target: { value: "guided_auto" } });
    expect(screen.queryByRole("dialog", { name: /자동승인 활성화/ })).toBeNull();
    expect(localStorage.getItem(CODING_APPROVAL_MODE_STORAGE_KEY)).toBe("guided_auto");
  });

  it("manual로 돌아가는 건 경고 없이 즉시 적용(안전 방향)", () => {
    localStorage.setItem(CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY, "t");
    localStorage.setItem(CODING_APPROVAL_MODE_STORAGE_KEY, "guided_auto");
    render(<CodingWorkbench />);
    fireEvent.change(screen.getByDisplayValue("자동 진행"), { target: { value: "manual" } });
    expect(screen.queryByRole("dialog", { name: /자동승인 활성화/ })).toBeNull();
    expect(localStorage.getItem(CODING_APPROVAL_MODE_STORAGE_KEY)).toBe("manual");
  });
});
