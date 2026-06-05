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

export function createProviderSmokeExecutionTargets({ liveDeepSeek = false } = {}) {
  return [
    {
      id: "mimo-openai",
      label: "MiMo OpenAI-compatible sample conversation",
      command: [
        process.execPath,
        "scripts/mimo-chat.mjs",
        "--provider",
        "mimo",
        "--model",
        "mimo-v2.5-pro",
        "한국어로 한 문장만 답해. MiMo provider smoke 정상 여부를 확인한다.",
      ],
      networkCall: true,
    },
    {
      id: "deepseek",
      label: liveDeepSeek ? "DeepSeek live provider smoke" : "DeepSeek dry-run provider smoke",
      command: [
        process.execPath,
        "scripts/smoke-deepseek-provider.mjs",
        liveDeepSeek ? "--live" : "--dry-run",
      ],
      networkCall: liveDeepSeek,
    },
  ];
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

function runAllProviderSmokes() {
  const liveDeepSeek = process.env.PROVIDER_SMOKE_LIVE === "1" || process.argv.includes("--live-deepseek");
  const targets = createProviderSmokeExecutionTargets({ liveDeepSeek });
  const results = targets.map((target) => {
    const [command, ...args] = target.command;
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      id: target.id,
      label: target.label,
      networkCall: target.networkCall,
      status: result.status === 0 ? "ok" : "failed",
      exitCode: result.status ?? 1,
      stdoutPreview: redactProviderSmokeReport(result.stdout ?? "").slice(0, 1200),
      stderrPreview: redactProviderSmokeReport(result.stderr ?? "").slice(0, 1200),
    };
  });
  console.log(redactProviderSmokeReport({ generatedAt: new Date().toISOString(), results }));
  process.exit(results.every((result) => result.status === "ok") ? 0 : 1);
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/provider-ai-smoke.mjs [--list|--run-mimo]",
      "",
      "--list      Print the redacted provider smoke manifest without network calls.",
      "--run-mimo  Run the MiMo OpenAI-compatible sample conversation. This performs a network call.",
      "--run-all   Run MiMo sample plus DeepSeek dry-run. Add --live-deepseek or PROVIDER_SMOKE_LIVE=1 for DeepSeek live.",
    ].join("\n"),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = new Set(process.argv.slice(2));

  if (args.has("--help")) {
    printHelp();
  } else if (args.has("--run-all")) {
    runAllProviderSmokes();
  } else if (args.has("--run-mimo")) {
    runMimoSmoke();
  } else {
    printPlan();
  }
}
