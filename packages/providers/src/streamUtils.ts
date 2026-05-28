/**
 * Converts a response body into an AsyncIterable of Uint8Array chunks.
 */
export async function* responseToChunks(body: any): AsyncIterable<Uint8Array> {
  if (!body) return;
  if (typeof body[Symbol.asyncIterator] === "function") {
    yield* body;
  } else if (typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  } else if (typeof body.on === "function") {
    // Node.js stream fallback
    for await (const chunk of body) {
      yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    }
  } else {
    // Fallback for custom iterable of chunks or arrays (e.g. mock test cases)
    if (Symbol.asyncIterator in body || Symbol.iterator in body) {
      for await (const chunk of body) {
        yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
      }
    }
  }
}

/**
 * Splits a stream of Uint8Array chunks into text lines.
 */
export async function* chunksToLines(chunks: AsyncIterable<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary = buffer.indexOf("\n");
    while (boundary !== -1) {
      const line = buffer.substring(0, boundary).trim();
      buffer = buffer.substring(boundary + 1);
      yield line;
      boundary = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    yield buffer.trim();
  }
}
