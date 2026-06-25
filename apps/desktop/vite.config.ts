/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { MIMO_CREDENTIAL_ENV, MIMO_UPSTREAM } from "./src/lib/mimoProxy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function mimoAuthInjector(headerName: string, headerValue: (key: string) => string) {
  return (proxy: { on: (event: string, listener: (...args: unknown[]) => void) => void }) => {
    proxy.on("proxyReq", (...args: unknown[]) => {
      const proxyReq = args[0] as { setHeader: (k: string, v: string) => void; removeHeader: (k: string) => void };
      const key = process.env[MIMO_CREDENTIAL_ENV]?.trim();
      if (!key) return;
      proxyReq.removeHeader("authorization");
      proxyReq.removeHeader("x-api-key");
      proxyReq.setHeader(headerName, headerValue(key));
    });
  };
}

export default defineConfig({
  // Tailwind 4 has a first-party Vite plugin that replaces the legacy
  // postcss approach. It scans source files automatically (no content
  // glob needed) and emits the CSS layer the new `@theme inline` syntax
  // in tokens.css expects.
  plugins: [react(), tailwindcss()],
  test: {
    setupFiles: ["./src/test/setupDomStorage.ts"],
  },
  server: {
    proxy: {
      "/mimo-token-anthropic": {
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/mimo-token-anthropic/, "/anthropic"),
        target: MIMO_UPSTREAM,
        configure: mimoAuthInjector("x-api-key", (key) => key) as never,
      },
      "/mimo-token-openai": {
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/mimo-token-openai/, "/v1"),
        target: MIMO_UPSTREAM,
        configure: mimoAuthInjector("Authorization", (key) => `Bearer ${key}`) as never,
      },
    },
  },
  resolve: {
    alias: {
      "@ai-orchestrator/protocol": path.resolve(repoRoot, "packages/protocol/src/index.ts"),
      "@ai-orchestrator/providers": path.resolve(repoRoot, "packages/providers/src/index.ts"),
      "@ai-orchestrator/agents": path.resolve(repoRoot, "packages/agents/src/index.ts"),
      "@ai-orchestrator/simplememo": path.resolve(repoRoot, "packages/simplememo/src/index.ts"),
      // Shadcn-standard `@/` path for v0-generated primitives. Mirrors
      // the tsconfig.json `paths` entry so editor go-to-definition,
      // type resolution, and Vite bundling all agree.
      "@": path.resolve(__dirname, "src"),
    },
  },
});
