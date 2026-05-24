import { useEffect, useState } from "react";

/**
 * Tracks visualViewport so the composer can stay above the iOS virtual
 * keyboard. iOS Safari adjusts visualViewport.height (and a positive
 * offsetTop when a focused input is scrolled into view) when the keyboard
 * comes up, but does NOT resize the layout viewport — so without this we
 * end up with the composer hidden under the keyboard.
 *
 * The hook also writes the keyboard inset onto a CSS custom property
 * (--keyboard-inset) so CSS rules can react to it without re-rendering.
 */
export function useViewportInsets() {
  const [keyboardInset, setKeyboardInset] = useState<number>(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
      document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return { keyboardInset };
}
