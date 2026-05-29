import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const targets = [
  "dist",
  ".turbo",
  ".vite",
  "apps/server/dist",
  "apps/desktop/dist",
  "packages/agents/dist",
  "packages/memory/dist",
  "packages/protocol/dist",
  "packages/providers/dist",
];

await Promise.all(
  targets.map(async (target) => {
    const absolutePath = join(root, target);
    await rm(absolutePath, { recursive: true, force: true });
  }),
);

console.log(`Removed ${targets.length} generated output directories.`);
