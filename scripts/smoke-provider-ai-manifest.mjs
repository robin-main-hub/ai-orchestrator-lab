#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createProviderSmokePlan,
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
  apiKey: "tp-abcdefghijklmnopqrstuvwxyz",
  bearer: "Bearer abc.def.ghi",
  deepseek: "sk-1234567890abcdef",
});

assert(!redacted.includes("tp-abcdefghijklmnopqrstuvwxyz"), "MiMo token plan keys must be redacted");
assert(!redacted.includes("sk-1234567890abcdef"), "DeepSeek/OpenAI-style keys must be redacted");
assert(!redacted.includes("Bearer abc.def.ghi"), "Bearer tokens must be redacted");

console.log("Provider AI smoke manifest passed.");
