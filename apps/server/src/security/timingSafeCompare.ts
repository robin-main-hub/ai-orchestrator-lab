import * as crypto from "node:crypto";

/**
 * Constant-time string comparison for credentials. Hashes both sides to a
 * fixed length first (same idiom as the HMAC signature check in index.ts), so
 * inputs of different lengths are compared without leaking length or prefix
 * timing. For bearer-token comparison — NOT a general string equality.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}
