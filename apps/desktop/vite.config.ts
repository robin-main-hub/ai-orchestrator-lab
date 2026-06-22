/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type ProxyOptions } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

// Dev-only mimo upstream + key. Read from the dev process env (NOT VITE_*), so the
// real key is injected by the dev server and never bundled into client JS. Mirrors
// the Cloudflare Pages Function (apps/desktop/functions/_mimoProxy.ts).
const MIMO_UPSTREAM = process.env.MIMO_UPSTREAM ?? "https://api.xiaomimimo.com";
const MIMO_API_KEY = process.env.MIMO_API_KEY?.trim();

function mimoProxy(prefix: string, upstreamBase: string, authStyle: "bearer" | "x-api-key"): ProxyOptions {
  return {
    changeOrigin: true,
    target: MIMO_UPSTREAM,
    rewrite: (proxyPath) => proxyPath.replace(new RegExp(`^${prefix}`), upstreamBase),
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        if (!MIMO_API_KEY) return;
        if (authStyle === "bearer") {
          proxyReq.setHeader("authorization", `Bearer ${MIMO_API_KEY}`);
        } else {
          proxyReq.setHeader("x-api-key", MIMO_API_KEY);
          proxyReq.removeHeader("authorization");
        }
      });
    },
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
      "/mimo-token-anthropic": mimoProxy("/mimo-token-anthropic", "/anthropic", "x-api-key"),
      "/mimo-token-openai": mimoProxy("/mimo-token-openai", "/v1", "bearer"),
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
