import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
