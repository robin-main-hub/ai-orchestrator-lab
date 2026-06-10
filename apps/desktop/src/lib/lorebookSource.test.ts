import { scanLorebooks } from "@ai-orchestrator/agents";
import { describe, expect, it } from "vitest";
import { bundledLorebooks, bundledLorebookTenants } from "./lorebookSource";

describe("bundled lorebooks", () => {
  it("bundles the repo lorebooks/*.json as valid books", () => {
    const ids = bundledLorebooks.map((book) => book.id);
    expect(ids).toContain("orchestrator-core");
    expect(ids).toContain("example-tenant-acme");
    expect(bundledLorebookTenants).toContain("default");
    expect(bundledLorebookTenants).toContain("acme");
  });

  it("multi-tenant isolation holds over the bundled books", () => {
    // default tenant never sees ACME's entries
    const defaultMatches = scanLorebooks(bundledLorebooks, "ACME 서비스에 DGX-01 점검", { tenantId: "default" });
    expect(defaultMatches.some((m) => m.bookId === "example-tenant-acme")).toBe(false);
    expect(defaultMatches.some((m) => m.bookId === "orchestrator-core")).toBe(true);
    // acme tenant sees its own book
    const acmeMatches = scanLorebooks(bundledLorebooks, "ACME 네이밍 확인", { tenantId: "acme" });
    expect(acmeMatches.some((m) => m.bookId === "example-tenant-acme")).toBe(true);
  });
});
