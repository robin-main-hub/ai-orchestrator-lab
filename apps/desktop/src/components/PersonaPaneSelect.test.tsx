// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PersonaPaneSelect } from "./PersonaPaneSelect";

/**
 * PersonaPaneSelect — Radix DropdownMenu 팝오버로 대체한 페르소나 선택기.
 * jsdom에서 Radix가 열리려면 PointerCapture/scrollIntoView/ResizeObserver
 * shim이 필요하다(아래 beforeAll). 상호작용은 fireEvent로 결정적으로 몰아준다.
 */

const OPTIONS = ["architect", "yohane", "makise"] as const;
const AVATARS: Record<string, string> = {
  architect: "/assets/architect.png",
  makise: "/assets/makise.png",
};
const resolveAvatar = (name: string) => AVATARS[name];

function openMenu() {
  const trigger = screen.getByRole("button", { name: "페르소나 선택" });
  // Radix 트리거는 pointerdown에서 열린다(마우스). pointer 시퀀스 + click을 모두 보낸다.
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
  return trigger;
}

beforeAll(() => {
  // jsdom은 PointerCapture API가 없어 Radix가 pointerdown 처리 중 throw한다 — no-op shim.
  if (!(Element.prototype as any).hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
  }
  if (!(Element.prototype as any).setPointerCapture) {
    (Element.prototype as any).setPointerCapture = () => {};
  }
  if (!(Element.prototype as any).releasePointerCapture) {
    (Element.prototype as any).releasePointerCapture = () => {};
  }
  // roving focus가 항목으로 스크롤하려 할 때 필요.
  if (!(Element.prototype as any).scrollIntoView) {
    (Element.prototype as any).scrollIntoView = () => {};
  }
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("PersonaPaneSelect", () => {
  it("트리거에 현재 선택된 페르소나 이름을 보여준다", () => {
    render(<PersonaPaneSelect value="makise" options={OPTIONS} onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: "페르소나 선택" });
    expect(trigger.textContent).toContain("makise");
  });

  it("값이 비면 placeholder(기본/커스텀)를 보여준다", () => {
    render(<PersonaPaneSelect value="" options={OPTIONS} onChange={() => {}} placeholder="예: architect" />);
    expect(screen.getByRole("button", { name: "페르소나 선택" }).textContent).toContain("예: architect");
  });

  it("메뉴를 열면 제공된 모든 옵션과 아바타 이미지가 렌더된다", async () => {
    render(<PersonaPaneSelect value="architect" options={OPTIONS} onChange={() => {}} resolveAvatar={resolveAvatar} />);
    openMenu();
    const menu = await screen.findByRole("menu");
    for (const name of OPTIONS) {
      expect(within(menu).getByText(name)).toBeTruthy();
    }
    // resolveAvatar가 url을 주는 항목은 persona-pane-option-avatar 이미지를 렌더
    const avatars = menu.querySelectorAll("img.persona-pane-option-avatar");
    expect(avatars.length).toBeGreaterThanOrEqual(1);
  });

  it("항목을 클릭하면 onChange가 그 페르소나 이름으로 호출된다", async () => {
    const onChange = vi.fn();
    render(<PersonaPaneSelect value="architect" options={OPTIONS} onChange={onChange} resolveAvatar={resolveAvatar} />);
    openMenu();
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByText("yohane"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("yohane"));
  });

  it("키보드: 열고 ArrowDown + Enter로 첫 항목을 선택한다", async () => {
    const onChange = vi.fn();
    render(<PersonaPaneSelect value="" options={OPTIONS} onChange={onChange} />);
    openMenu();
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement ?? menu, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("architect"));
  });

  it("키보드: Escape로 메뉴가 닫힌다", async () => {
    render(<PersonaPaneSelect value="" options={OPTIONS} onChange={() => {}} />);
    openMenu();
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
