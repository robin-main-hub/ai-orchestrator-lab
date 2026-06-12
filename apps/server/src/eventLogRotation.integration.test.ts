import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJsonlServerEventStorage,
  loadServerEventStorageStateFromDir,
  pushEventsToPersistentServerStorage,
} from "./index";
import { ACTIVE_EVENT_LOG, parseSegmentMs } from "./eventLogRotation";

function pushRequest(n: number) {
  const event = {
    id: `event_rot_${n}`,
    sessionId: "session_rot",
    type: "conversation.message.created",
    payload: { messageId: `m_${n}`, redaction: "applied" },
    createdAt: `2026-06-13T00:00:0${n}.000Z`,
    source: "desktop" as const,
    sourceTrust: "trusted" as const,
    redacted: true,
  };
  return {
    id: `sync_rot_${n}`,
    clientId: "client_macbook",
    sessionId: event.sessionId,
    events: [event],
    idempotencyKey: `client_macbook:session_rot:event_rot_${n}`,
    createdAt: event.createdAt,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("event log rotation (integration)", () => {
  it("rotates the active file once it crosses the size threshold, losing no events", async () => {
    // 임계 1바이트 → 두 번째 push부터 활성 파일이 임계를 넘어 회전
    vi.stubEnv("EVENT_LOG_MAX_BYTES", "1");
    vi.stubEnv("EVENT_LOG_KEEP_SEGMENTS", "16");
    const dir = await mkdtemp(join(tmpdir(), "ai-orch-rot-"));
    try {
      const storage = createJsonlServerEventStorage(dir);
      for (let n = 1; n <= 4; n += 1) {
        await pushEventsToPersistentServerStorage(pushRequest(n), storage, pushRequest(n).createdAt);
      }

      const files = await readdir(dir);
      const segments = files.filter((f) => parseSegmentMs(f) !== null);
      expect(files).toContain(ACTIVE_EVENT_LOG); // 활성 파일은 늘 존재
      expect(segments.length).toBeGreaterThan(0); // 회전이 실제로 일어났다

      // 핵심: 활성 + 모든 세그먼트를 합쳐 4개 이벤트가 전부 복원된다(유실 없음)
      const restored = await loadServerEventStorageStateFromDir(dir);
      expect(restored.eventsById.size).toBe(4);
      for (let n = 1; n <= 4; n += 1) {
        expect(restored.eventsById.has(`event_rot_${n}`)).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prunes the oldest segments beyond the keep limit (bounded disk use)", async () => {
    vi.stubEnv("EVENT_LOG_MAX_BYTES", "1");
    vi.stubEnv("EVENT_LOG_KEEP_SEGMENTS", "1"); // 세그먼트 1개만 보관
    const dir = await mkdtemp(join(tmpdir(), "ai-orch-prune-"));
    try {
      const storage = createJsonlServerEventStorage(dir);
      for (let n = 1; n <= 5; n += 1) {
        await pushEventsToPersistentServerStorage(pushRequest(n), storage, pushRequest(n).createdAt);
      }

      const segments = (await readdir(dir)).filter((f) => parseSegmentMs(f) !== null);
      // keep=1 이므로 세그먼트는 1개로 제한된다(가장 오래된 것들은 prune)
      expect(segments.length).toBeLessThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a brand-new storage dir with no log files restores an empty state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ai-orch-empty-"));
    try {
      const restored = await loadServerEventStorageStateFromDir(dir);
      expect(restored.eventsById.size).toBe(0);
      expect(restored.revision).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
