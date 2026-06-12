const DEV_ORCHESTRATOR_API_TOKEN = "dev-orchestrator-token";

type DesktopImportMeta = ImportMeta & {
  env?: {
    VITE_ORCHESTRATOR_API_TOKEN?: string;
  };
};

type DgxAuthOptions = {
  body?: string;
  nowMs?: number;
  nonce?: string;
};

export class DgxAuthCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DgxAuthCryptoError";
  }
}

// vitest 3은 모듈마다 import.meta.env 사본을 주입해서 테스트 쪽에서
// vi.stubEnv·test.env·직접 대입 어느 것으로도 이 모듈이 읽는 env를 비울 수 없다.
// 테스트가 __test.setTokenOverrideForTests로만 주입하는 우회 통로 (런타임 경로 불변).
let testTokenOverride: string | null = null;

export function resolveDgxOrchestratorApiToken() {
  const raw = testTokenOverride ?? ((import.meta as DesktopImportMeta).env?.VITE_ORCHESTRATOR_API_TOKEN ?? "");
  const token = raw.trim();
  return token || DEV_ORCHESTRATOR_API_TOKEN;
}

export async function generateBrowserHmacSha256(secret: string, message: string): Promise<string> {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.subtle) {
    const encoder = new TextEncoder();
    const cryptoKey = await cryptoObj.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await cryptoObj.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
    return bytesToHex(new Uint8Array(signatureBuffer));
  }

  return hmacSha256Fallback(secret, message);
}

export async function createDgxOrchestratorAuthHeaders(
  method: string,
  path: string,
  targetUrl?: string,
  options: DgxAuthOptions = {},
): Promise<Record<string, string>> {
  const token = resolveDgxOrchestratorApiToken();
  if (targetUrl && targetUrl.startsWith("http://")) {
    const timestamp = (options.nowMs ?? Date.now()).toString();
    const nonce = options.nonce ?? generateSecureNonce();
    const signedPath = resolveSignedPath(path, targetUrl);
    const bodyHash = await generateBrowserSha256Hex(options.body ?? "");
    const message = [method.toUpperCase(), signedPath, bodyHash, timestamp, nonce].join("\n");
    const signature = await generateBrowserHmacSha256(token, message);

    return {
      "x-dgx-signature": signature,
      "x-dgx-timestamp": timestamp,
      "x-dgx-nonce": nonce,
      "x-dgx-body-sha256": bodyHash,
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
  options: DgxAuthOptions = {},
): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    ...(await createDgxOrchestratorAuthHeaders(method, path, targetUrl, options)),
  };
}

function resolveSignedPath(path: string, targetUrl?: string) {
  if (!targetUrl) return path;
  const url = new URL(targetUrl, "http://localhost");
  return `${url.pathname}${url.search}`;
}

function generateSecureNonce() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  if (!cryptoObj?.getRandomValues) {
    throw new DgxAuthCryptoError("Secure random nonce generation is unavailable.");
  }

  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function generateBrowserSha256Hex(message: string) {
  const cryptoObj = globalThis.crypto;
  const bytes = new TextEncoder().encode(message);
  if (cryptoObj?.subtle) {
    const hash = await cryptoObj.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(hash));
  }

  return bytesToHex(sha256(bytes));
}

function hmacSha256Fallback(secret: string, message: string) {
  const blockSize = 64;
  let key = new TextEncoder().encode(secret);
  if (key.length > blockSize) {
    key = sha256(key);
  }

  const normalizedKey = new Uint8Array(blockSize);
  normalizedKey.set(key);

  const outerPad = new Uint8Array(blockSize);
  const innerPad = new Uint8Array(blockSize);
  for (let index = 0; index < blockSize; index += 1) {
    outerPad[index] = normalizedKey[index]! ^ 0x5c;
    innerPad[index] = normalizedKey[index]! ^ 0x36;
  }

  const messageBytes = new TextEncoder().encode(message);
  const innerHash = sha256(concatBytes(innerPad, messageBytes));
  return bytesToHex(sha256(concatBytes(outerPad, innerHash)));
}

function sha256(message: Uint8Array) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  writeSha256MessageLength(view, paddedLength, message.length);

  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15]!;
      const word2 = words[index - 2]!;
      const s0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const s1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }

    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + constants[index]! + words[index]!) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }

  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  hash.forEach((value, index) => outputView.setUint32(index * 4, value, false));
  return output;
}

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits));
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const output = new Uint8Array(left.length + right.length);
  output.set(left);
  output.set(right, left.length);
  return output;
}

function writeSha256MessageLength(view: DataView, paddedLength: number, byteLength: number) {
  const bitLength = byteLength * 8;
  const highBits = Math.floor(bitLength / 0x1_0000_0000);
  const lowBits = bitLength % 0x1_0000_0000;
  view.setUint32(paddedLength - 8, highBits, false);
  view.setUint32(paddedLength - 4, lowBits, false);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const __test = {
  setTokenOverrideForTests(value: string | null) {
    testTokenOverride = value;
  },
  writeSha256MessageLength,
};
