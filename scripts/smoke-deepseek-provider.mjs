import { readFile } from "node:fs/promises";

const args = new Set(process.argv.slice(2));
if (!args.has("--no-dotenv")) {
  await loadDotEnvIfPresent();
}

const dryRun = args.has("--dry-run");
const liveRun = args.has("--live") || process.env.PROVIDER_SMOKE_LIVE === "1";
const baseUrl = normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1");
const endpoint = `${baseUrl}/chat/completions`;
const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const prompt = process.env.PROVIDER_SMOKE_PROMPT ?? "Reply with exactly OK.";
const timeoutMs = readPositiveInteger(process.env.PROVIDER_SMOKE_TIMEOUT_MS, 10_000);
const apiKey = process.env.PROVIDER_SMOKE_DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_API_KEY;

if (dryRun) {
  printJson({
    status: "dry_run",
    provider: "deepseek",
    endpoint: redact(endpoint),
    model,
    timeoutMs,
    hasApiKey: Boolean(apiKey),
    networkCall: false,
    liveRequiredForNetworkCall: true,
  });
  process.exit(0);
}

if (!liveRun) {
  printJson({
    status: "skipped",
    provider: "deepseek",
    endpoint: redact(endpoint),
    model,
    reason: "live flag required",
    usage: "Run with --live or PROVIDER_SMOKE_LIVE=1 to perform the network call.",
    networkCall: false,
  });
  process.exit(0);
}

if (!apiKey) {
  console.error(
    "DeepSeek smoke requires PROVIDER_SMOKE_DEEPSEEK_API_KEY or DEEPSEEK_API_KEY. " +
      "Use --dry-run to validate configuration without a network call.",
  );
  process.exit(2);
}

try {
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 16,
        temperature: 0,
      }),
    },
    timeoutMs,
  );

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`DeepSeek smoke failed: HTTP ${response.status} ${response.statusText} ${redact(rawText).slice(0, 400)}`);
  }

  const payload = parseJson(rawText);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("DeepSeek smoke failed: response did not include choices[0].message.content.");
  }

  printJson({
    status: "ok",
    provider: "deepseek",
    endpoint: redact(endpoint),
    model,
    contentPreview: redact(content).trim().slice(0, 120),
    usage: payload.usage ?? null,
  });
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}

async function loadDotEnvIfPresent() {
  const envUrl = new URL("../.env", import.meta.url);
  let text = "";
  try {
    text = await readFile(envUrl, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValueParts] = line.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid DEEPSEEK_BASE_URL: ${redact(value)}`);
  }
}

function readPositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchWithTimeout(url, init, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  timer.unref?.();

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`DeepSeek smoke failed: response was not JSON. ${redact(rawText).slice(0, 400)}`);
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function redact(value) {
  return String(value)
    .replace(/https?:\/\/[^\s"'`<>)]+/gi, "[redacted-url]")
    .replace(/\b(?:sk|deepseek|claude|anthropic|grok|xai|ghp|gho|ghs|ghr|ghu|glpat|pat)[-_][A-Za-z0-9_-]{12,}\b/gi, "[redacted-token]")
    .replace(/\b(Bearer|Authorization)\s+["']?[^"'\s]+["']?/gi, "$1 [redacted]")
    .replace(/\b(DEEPSEEK_API_KEY|PROVIDER_SMOKE_DEEPSEEK_API_KEY|API_KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]+["']?/gi, "$1=[redacted]")
    .replace(/\/Users\/[^\s"']+/g, "[redacted-path]")
    .replace(/\/home\/[^\s"']+/g, "[redacted-path]");
}
