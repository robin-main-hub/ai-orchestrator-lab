// Polyfill window.crypto.randomUUID for non-secure HTTP contexts (e.g., direct IP address access)
if (typeof window !== "undefined") {
  if (!window.crypto) {
    (window as any).crypto = {} as any;
  }
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = function randomUUID() {
      if (window.crypto.getRandomValues) {
        return (([1e7] as any) + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c: any) => {
          const arr = new Uint8Array(1);
          window.crypto.getRandomValues(arr);
          const val = arr[0] !== undefined ? arr[0] : 0;
          return (c ^ (val & (15 >> (c / 4)))).toString(16);
        });
      }
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
  }
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Font packages — bundled via Vite so the desktop works offline. Inter
// covers Latin. JetBrains Mono is reserved for the terminal dock and
// code blocks. Korean glyphs are handled by OS system fallbacks
// (Apple SD Gothic Neo on macOS, Malgun Gothic on Windows) so we
// don't ship a heavy Korean webfont — see tokens.css `--font-sans`
// for the cascade. Users who have Pretendard installed locally get
// it automatically via the cascade.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

// Design tokens MUST load before the legacy stylesheet so component
// authors who reach for `--background` etc. from the new system see the
// expected values. Legacy `styles.css` defines its own `--bg` / `--cyan`
// variables on a different namespace, so the two systems coexist
// without overlap.
import "./styles/tokens.css";
import "./styles.css";
import "./styles/coding-workbench.css";

const root = createRoot(document.getElementById("root")!);

void import("./App")
  .then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.render(
      <div className="boot-error">
        <strong>Desktop UI boot failed</strong>
        <span>{message}</span>
      </div>,
    );
  });
