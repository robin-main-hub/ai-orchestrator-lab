// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useDraftAttachments } from "./useDraftAttachments";

afterEach(cleanup);

const txt = (name: string, body: string) => new File([body], name, { type: "text/plain" });
const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

describe("useDraftAttachments — 기존 helper 재사용 컨트롤러 (jsdom)", () => {
  it("텍스트 첨부를 받아들이고 본문을 백그라운드 하이드레이트 → provider 본문", async () => {
    const { result } = renderHook(() => useDraftAttachments({ modelModalities: ["text"], maxCount: 5 }));
    act(() => result.current.add([txt("notes.txt", "hello body")]));
    expect(result.current.attachments).toHaveLength(1);
    await waitFor(() => expect(result.current.attachments[0]!.textContent).toBe("hello body"));
    expect(result.current.toProvider()?.[0]?.textContent).toBe("hello body");
  });

  it("이미지 미지원 모델이면 이미지를 조용히 삼키지 않고 거부 + 모델 교체 사유", () => {
    const { result } = renderHook(() => useDraftAttachments({ modelModalities: ["text"], maxCount: 5 }));
    act(() => result.current.add([png("shot.png")]));
    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.rejectedPlans.length).toBeGreaterThan(0);
    expect(result.current.rejectedPlans[0]!.reason ?? "").toContain("모델");
  });

  it("이미지 지원 모델이면 수락 + dataUrl 하이드레이트 → vision rider", async () => {
    const { result } = renderHook(() => useDraftAttachments({ modelModalities: ["text", "image"], maxCount: 5 }));
    act(() => result.current.add([png("shot.png")]));
    expect(result.current.attachments).toHaveLength(1);
    await waitFor(() => expect(result.current.attachments[0]!.dataUrl).toMatch(/^data:image\/png;base64,/));
    expect(result.current.toProvider()?.[0]?.dataUrl).toMatch(/^data:image\/png/);
  });

  it("최대 개수를 넘기면 잘린다", () => {
    const { result } = renderHook(() => useDraftAttachments({ modelModalities: ["text"], maxCount: 2 }));
    act(() => result.current.add([txt("a.txt", "a"), txt("b.txt", "b"), txt("c.txt", "c")]));
    expect(result.current.attachments.length).toBeLessThanOrEqual(2);
    expect(result.current.rejectedPlans.length).toBeGreaterThan(0);
  });

  it("remove와 reset", () => {
    const { result } = renderHook(() => useDraftAttachments({ modelModalities: ["text"], maxCount: 5 }));
    act(() => result.current.add([txt("a.txt", "a")]));
    const id = result.current.attachments[0]!.id;
    act(() => result.current.remove(id));
    expect(result.current.attachments).toHaveLength(0);
    act(() => result.current.add([txt("b.txt", "b")]));
    act(() => result.current.reset());
    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.rejectedPlans).toHaveLength(0);
  });
});
