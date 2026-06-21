import { describe, expect, it } from "vitest";
import { chunksToLines, responseToChunks } from "./streamUtils";

// streamUtils holds the two pure async generators every streaming adapter
// (anthropic/ollama/openAiCompatible) funnels its HTTP response body through,
// yet neither was ever pinned. They do NO network and NO I/O — they only
// reshape an opaque `body` into bytes, then bytes into trimmed text lines.
// Four authority facts protect that hot path: (1) SHAPE-AGNOSTIC INGEST —
// responseToChunks accepts every body flavor a real fetch/runtime hands back
// (async-iterable, a web ReadableStream via getReader, a sync-iterable like an
// array) and a falsy body yields nothing instead of throwing, so a missing body
// can never crash the stream. (2) READER HYGIENE — the getReader path drains
// until {done:true} and ALWAYS releaseLock()s, even though no error is thrown,
// so a borrowed reader is never leaked. (3) BYTES-OUT NORMALIZATION — string
// chunks are TextEncoder-encoded to Uint8Array while Uint8Array chunks pass
// through untouched, so downstream always sees bytes. (4) LINE HONESTY —
// chunksToLines splits on "\n", trims each line, REASSEMBLES a line split
// across two chunks, flushes a trailing non-empty remainder, and drops a
// trailing blank/whitespace-only remainder, so no half-line is lost and no
// empty tail line is fabricated. All expected values derive from feeding the
// real generators concrete inputs (no magic literals).

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (u: Uint8Array) => new TextDecoder().decode(u);

describe("responseToChunks — shape-agnostic ingest + reader hygiene", () => {
  it("yields nothing for a falsy body (missing body never throws)", async () => {
    expect(await collect(responseToChunks(null))).toEqual([]);
    expect(await collect(responseToChunks(undefined))).toEqual([]);
    expect(await collect(responseToChunks(0))).toEqual([]);
  });

  it("drains an async-iterable body as-is (the common adapter path)", async () => {
    async function* body() {
      yield enc("a");
      yield enc("b");
    }
    const out = await collect(responseToChunks(body()));
    expect(out.map(dec)).toEqual(["a", "b"]);
  });

  it("reads a web ReadableStream via getReader and ALWAYS releases the lock", async () => {
    const reads = [{ done: false, value: enc("x") }, { done: false, value: enc("y") }, { done: true, value: undefined }];
    let i = 0;
    let released = false;
    const body = {
      getReader() {
        return {
          read: async () => reads[i++]!,
          releaseLock: () => {
            released = true;
          },
        };
      },
    };
    const out = await collect(responseToChunks(body));
    expect(out.map((u) => dec(u as Uint8Array))).toEqual(["x", "y"]); // stops at done:true
    expect(released).toBe(true); // borrowed reader is not leaked
  });

  it("falls back to a sync-iterable body and normalizes string chunks to bytes", async () => {
    // a plain array has Symbol.iterator but no asyncIterator-fn / getReader / on
    const out = await collect(responseToChunks(["a", enc("b")]));
    expect(out.every((u) => u instanceof Uint8Array)).toBe(true); // strings encoded, bytes passthrough
    expect(out.map((u) => dec(u))).toEqual(["a", "b"]);
  });
});

describe("chunksToLines — line honesty (no half-line lost, no empty tail fabricated)", () => {
  async function* fromStrings(...parts: string[]) {
    for (const p of parts) yield enc(p);
  }

  it("splits on newline and trims each line", async () => {
    const out = await collect(chunksToLines(fromStrings("  hello  \n world \n")));
    expect(out).toEqual(["hello", "world"]); // trailing blank after final \n is dropped
  });

  it("reassembles a single line split across two chunks", async () => {
    const out = await collect(chunksToLines(fromStrings("data: par", "tial\n")));
    expect(out).toEqual(["data: partial"]); // buffer carried across the chunk boundary
  });

  it("flushes a trailing non-empty remainder that has no terminating newline", async () => {
    const out = await collect(chunksToLines(fromStrings("first\nlast-no-newline")));
    expect(out).toEqual(["first", "last-no-newline"]);
  });

  it("drops a trailing whitespace-only remainder (no fabricated empty tail line)", async () => {
    const out = await collect(chunksToLines(fromStrings("only\n   ")));
    expect(out).toEqual(["only"]);
  });
});
