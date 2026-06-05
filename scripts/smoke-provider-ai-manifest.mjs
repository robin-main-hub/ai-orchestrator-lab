#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createProviderSmokePlan,
  createProviderSmokeExecutionTargets,
  redactProviderSmokeReport,
} from "./provider-ai-smoke.mjs";

const plan = createProviderSmokePlan();

assert(plan.targets.length >= 3, "provider smoke plan should cover MiMo OpenAI, MiMo Anthropic, and DeepSeek routes");
assert(plan.targets.some((target) => target.id === "mimo-openai"), "MiMo OpenAI-compatible route must be listed");
assert(plan.targets.some((target) => target.id === "mimo-anthropic"), "MiMo Anthropic-compatible route must be listed");
assert(plan.targets.some((target) => target.id === "deepseek"), "DeepSeek smoke route must be listed");
assert(
  plan.targets.every((target) => target.env.every((name) => !name.startsWith("sk-") && !name.startsWith("tp-"))),
  "manifest must name env vars, not raw secret values",
);

const redacted = redactProviderSmokeReport({
  endpoint: "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
  path: "/Users/robin/Documents/ai-orchestrator-lab-review/.env",
  apiKey: "tp-abcdefghijklmnopqrstuvwxyz",
  bearer: "Bearer abc.def.ghi",
  deepseek: "sk-1234567890abcdef",
});

assert(!redacted.includes("https://token-plan-sgp.xiaomimimo.com"), "provider URLs must be redacted");
assert(!redacted.includes("/Users/robin/Documents"), "local paths must be redacted");
assert(!redacted.includes("tp-abcdefghijklmnopqrstuvwxyz"), "MiMo token plan keys must be redacted");
assert(!redacted.includes("sk-1234567890abcdef"), "DeepSeek/OpenAI-style keys must be redacted");
assert(!redacted.includes("Bearer abc.def.ghi"), "Bearer tokens must be redacted");

const dryRunTargets = createProviderSmokeExecutionTargets();
assert(dryRunTargets.some((target) => target.id === "mimo-openai"), "run-all should include MiMo sample target");
assert(dryRunTargets.some((target) => target.id === "deepseek"), "run-all should include DeepSeek target");
assert(
  dryRunTargets.find((target) => target.id === "mimo-openai")?.networkCall === false,
  "MiMo should require explicit opt-in in run-all",
);
assert(
  dryRunTargets.find((target) => target.id === "deepseek")?.networkCall === false,
  "DeepSeek should be dry-run by default in run-all",
);

const liveTargets = createProviderSmokeExecutionTargets({ liveDeepSeek: true, liveMimo: true });
assert(
  liveTargets.find((target) => target.id === "mimo-openai")?.networkCall === true,
  "MiMo live mode should be explicit",
);
assert(
  liveTargets.find((target) => target.id === "deepseek")?.networkCall === true,
  "DeepSeek live mode should be explicit",
);

console.log("Provider AI smoke manifest passed.");
