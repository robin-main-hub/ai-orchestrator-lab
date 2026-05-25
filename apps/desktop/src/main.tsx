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
