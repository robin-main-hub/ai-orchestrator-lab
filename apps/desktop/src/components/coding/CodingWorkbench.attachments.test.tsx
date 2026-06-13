// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CodingWorkbench } from "./CodingWorkbench";
import { CODING_SESSIONS_STORAGE_KEY } from "../../lib/codingChatStore";

afterEach(cleanup);
beforeEach(() => {
  // 세션 없는 깨끗한 상태 — active 모델 없음 → 이미지 첨부는 능력 미달로 거부되어야 한다
  localStorage.removeItem(CODING_SESSIONS_STORAGE_KEY);
});

function imageItem(): DataTransferItem {
  return {
    kind: "file",
    type: "image/png",
    getAsFile: () => new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" }),
  } as unknown as DataTransferItem;
}

describe("CodingWorkbench 첨부 컴포저 배선 (jsdom)", () => {
  it("첨부 버튼과 0/5 카운터가 보인다", () => {
    render(<CodingWorkbench />);
    expect(screen.getByLabelText("파일 첨부")).toBeTruthy();
    expect(screen.getByText("0/5")).toBeTruthy();
  });

  it("능력 미달(모델 미선택) 상태에서 이미지 paste는 조용히 삼키지 않고 거부 표면화 + 모델 교체 CTA", () => {
    render(<CodingWorkbench />);
    fireEvent.paste(screen.getByLabelText("코딩 지시 입력"), { clipboardData: { items: [imageItem()] } });
    expect(screen.getByText(/추가되지 않았습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /모델 바꾸기/ })).toBeTruthy();
  });

  it("텍스트 paste는 거부 경고를 띄우지 않는다(기본 입력 동작 유지)", () => {
    render(<CodingWorkbench />);
    fireEvent.paste(screen.getByLabelText("코딩 지시 입력"), {
      clipboardData: {
        items: [{ kind: "string", type: "text/plain", getAsFile: () => null } as unknown as DataTransferItem],
      },
    });
    expect(screen.queryByText(/추가되지 않았습니다/)).toBeNull();
  });
});
