#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { redactSensitiveText } from "./mimo-chat.mjs";

export function createProviderSmokePlan() {
  return {
    generatedAt: new Date().toISOString(),
    targets: [
      {
        id: "mimo-openai",
        label: "MiMo OpenAI-compatible route",
        command: "node scripts/mimo-chat.mjs --provider mimo --model mimo-v2.5-pro <prompt>",
        env: ["MIMO_API_KEY"],
        mode: "manual-network-smoke",
        risk: "network-and-quota",
      },
      {
        id: "mimo-anthropic",
        label: "MiMo Anthropic-compatible route",
        command: "node scripts/mimo-chat.mjs --provider mimo-tp --model mimo-v2.5-pro <prompt>",
        env: ["MIMO_API_KEY"],
        mode: "compatibility-probe",
        risk: "provider-route-may-not-support-openai-chat-shape",
      },
      {
        id: "deepseek",
        label: "DeepSeek provider smoke",
        command: "pnpm provider:smoke:deepseek",
        env: ["DEEPSEEK_API_KEY"],
        mode: "manual-network-smoke",
        risk: "network-and-quota",
      },
    ],
  };
}

export function redactProviderSmokeReport(value) {
  return redactSensitiveText(JSON.stringify(value, null, 2));
}

function printPlan() {
  console.log(redactProviderSmokeReport(createProviderSmokePlan()));
}

function runMimoSmoke() {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/mimo-chat.mjs",
      "--provider",
      "mimo",
      "--model",
      "mimo-v2.5-pro",
      "한국어로 한 문장만 답해. MiMo provider smoke 정상 여부를 확인한다.",
    ],
    {
      stdio: "inherit",
    },
  );

  process.exit(result.status ?? 1);
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/provider-ai-smoke.mjs [--list|--run-mimo]",
      "",
      "--list      Print the redacted provider smoke manifest without network calls.",
      "--run-mimo  Run the MiMo OpenAI-compatible sample conversation. This performs a network call.",
    ].join("\n"),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = new Set(process.argv.slice(2));

  if (args.has("--help")) {
    printHelp();
  } else if (args.has("--run-mimo")) {
    runMimoSmoke();
  } else {
    printPlan();
  }
}
