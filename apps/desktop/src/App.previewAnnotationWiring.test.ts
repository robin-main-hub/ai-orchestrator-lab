import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("App preview annotation wiring smoke", () => {
  it("keeps the latest preview annotation draft and passes it to preview UI and Mission Workspace", () => {
    expect(appSource).toContain("const [previewAnnotationDraft, setPreviewAnnotationDraft]");
    expect(appSource).toContain("const handlePreviewAnnotationDraft = useCallback");
    expect(appSource).toContain("onSendPreviewAnnotation={handlePreviewAnnotationDraft}");
    expect(appSource).toContain("previewAnnotationDraft");
  });
});
