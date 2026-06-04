const DEV_ORCHESTRATOR_API_TOKEN = "dev-orchestrator-token";

type DesktopImportMeta = ImportMeta & {
  env?: {
    VITE_ORCHESTRATOR_API_TOKEN?: string;
  };
};

export function resolveDgxOrchestratorApiToken() {
  const token = ((import.meta as DesktopImportMeta).env?.VITE_ORCHESTRATOR_API_TOKEN ?? "").trim();
  return token || DEV_ORCHESTRATOR_API_TOKEN;
}

type DgxAuthOptions = {
  nowMs?: number;
  nonce?: string;
};

export async function generateBrowserHmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error("Web Crypto API is not supported in this environment.");
  }

  const cryptoKey = await cryptoObj.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await cryptoObj.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

export async function createDgxOrchestratorAuthHeaders(
  method: string,
  path: string,
  targetUrl?: string,
  options: DgxAuthOptions = {}
): Promise<Record<string, string>> {
  const token = resolveDgxOrchestratorApiToken();
  if (targetUrl && targetUrl.startsWith("http://")) {
    const timestamp = (options.nowMs ?? Date.now()).toString();
    const nonce = options.nonce ?? (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36));

    const message = [method.toUpperCase(), path, timestamp, nonce].join("\n");
    const signature = await generateBrowserHmacSha256(token, message);

    return {
      "x-dgx-signature": signature,
      "x-dgx-timestamp": timestamp,
      "x-dgx-nonce": nonce,
    };
  }

  return {
    authorization: `Bearer ${token}`,
  };
}

export async function createDgxOrchestratorJsonHeaders(
  method: string,
  path: string,
  targetUrl?: string,
  options: DgxAuthOptions = {}
): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    ...(await createDgxOrchestratorAuthHeaders(method, path, targetUrl, options)),
  };
}
