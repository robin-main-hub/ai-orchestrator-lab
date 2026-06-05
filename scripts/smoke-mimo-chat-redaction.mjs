#!/usr/bin/env node
import assert from "node:assert/strict";
import { redactSensitiveText, truncateForConsole } from "./mimo-chat.mjs";

const sensitive = [
  "sk-1234567890abcdef",
  "tp-abcdefghijklmnopqrstuvwxyz",
  "Bearer abc.def.ghi",
  "MIMO_API_KEY=do-not-print",
].join("\n");

const redacted = redactSensitiveText(sensitive);
assert(!redacted.includes("sk-1234567890abcdef"), "OpenAI/Anthropic-style key must be redacted");
assert(!redacted.includes("tp-abcdefghijklmnopqrstuvwxyz"), "MiMo token-plan key must be redacted");
assert(!redacted.includes("Bearer abc.def.ghi"), "Bearer token must be redacted");
assert(!redacted.includes("do-not-print"), "env secret assignment must be redacted");
assert(redacted.includes("[REDACTED:api_key]"), "api key redaction marker should be present");
assert(redacted.includes("[REDACTED:token_plan_key]"), "token plan redaction marker should be present");

const truncated = truncateForConsole(`${sensitive}\n${"x".repeat(100)}`, 24);
assert(truncated.includes("[truncated"), "long output must include truncation marker");
assert(!truncated.includes("do-not-print"), "truncated output must still redact secrets");

console.log("MiMo chat redaction smoke passed.");
