import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./attachmentContent";

// Characterization tests for bytesToBase64 (no behavior change), the only
// directly uncovered export in attachmentContent.ts (the 6-attachment cap is
// already pinned through toProviderAttachments). It is pure: it chunks the
// Uint8Array into 0x8000-byte blocks, builds a latin1 binary string via
// String.fromCharCode, and btoa-encodes it — the chunking exists to avoid the
// spread-arg stack overflow on large buffers. We pin the empty input, a known
// ASCII vector, a high-byte (0..255) round-trip, and a buffer that straddles
// the 0x8000 chunk boundary.

describe("bytesToBase64", () => {
  it("encodes an empty buffer to an empty string", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
  });

  it("encodes a known ASCII vector", () => {
    // "Hello" → btoa("Hello")
    expect(bytesToBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe("SGVsbG8=");
  });

  it("round-trips high bytes (0..255) through atob", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 255]);
    const decoded = atob(bytesToBase64(bytes));
    expect([...decoded].map((ch) => ch.charCodeAt(0))).toEqual([...bytes]);
  });

  it("encodes a buffer straddling the 0x8000 chunk boundary", () => {
    const n = 0x8000 + 5;
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) bytes[i] = i & 0xff;
    const encoded = bytesToBase64(bytes);
    // base64 length is 4 * ceil(n / 3) and the value round-trips byte-for-byte
    expect(encoded.length).toBe(4 * Math.ceil(n / 3));
    const decoded = atob(encoded);
    expect(decoded.length).toBe(n);
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(n - 1)).toBe((n - 1) & 0xff);
  });
});
