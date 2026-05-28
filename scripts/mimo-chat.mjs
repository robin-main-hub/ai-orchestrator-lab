import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load opencode.json config
function loadConfig() {
  const configPath = path.resolve(__dirname, '../opencode.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`opencode.json not found at ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

// Read from .env if it exists
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.trim().match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  let providerName = 'mimo';
  let modelName = 'mimo-v2.5-pro';
  let promptArgs = [];

  // Parse simple CLI args: [--provider <name>] [--model <model>] "prompt"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && i + 1 < args.length) {
      providerName = args[++i];
    } else if (args[i] === '--model' && i + 1 < args.length) {
      modelName = args[++i];
    } else {
      promptArgs.push(args[i]);
    }
  }

  const prompt = promptArgs.join(' ').trim();
  if (!prompt) {
    console.log('Usage: node scripts/mimo-chat.mjs [--provider mimo|mimo-tp] [--model model-name] <your prompt>');
    process.exit(1);
  }

  const config = loadConfig();
  const provider = config.provider?.[providerName];
  if (!provider) {
    console.error(`Error: Provider '${providerName}' not found in opencode.json`);
    process.exit(1);
  }

  let { baseURL, apiKey } = provider.options || {};
  if (!baseURL || !apiKey) {
    console.error(`Error: Missing baseURL or apiKey for provider '${providerName}'`);
    process.exit(1);
  }

  // Resolve env variables if formatted like {env:VAR}
  const envRegex = /^\{env:(.+)\}$/;
  const envMatch = apiKey.match(envRegex);
  if (envMatch) {
    const envVarName = envMatch[1];
    const envValue = process.env[envVarName];
    if (!envValue) {
      console.error(`Error: apiKey references env variable '${envVarName}', but it is not set in environment or .env.`);
      process.exit(1);
    }
    apiKey = envValue;
  }

  const resolvedBaseURL = baseURL.replace(/\/$/, '');
  const endpoint = `${resolvedBaseURL}/chat/completions`;

  console.log(`[MiMo CLI Direct] Querying ${modelName} via ${providerName} (${resolvedBaseURL})...`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      console.error(`API Error (Status ${response.status}):`);
      console.error(rawText);
      process.exit(1);
    }

    const data = JSON.parse(rawText);
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      console.error('Empty response choices from API:', data);
      process.exit(1);
    }

    console.log('\n--- Response from MiMo ---');
    console.log(reply);
    console.log('--------------------------');
  } catch (err) {
    console.error('Network or processing error:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
