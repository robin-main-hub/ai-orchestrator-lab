import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ai-orchestrator/protocol": path.resolve(repoRoot, "packages/protocol/src/index.ts"),
      "@ai-orchestrator/providers": path.resolve(repoRoot, "packages/providers/src/index.ts"),
      "@ai-orchestrator/agents": path.resolve(repoRoot, "packages/agents/src/index.ts"),
    },
  },
});
