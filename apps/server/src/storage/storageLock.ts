import { readFile, writeFile } from "node:fs/promises";

/**
 * Advisory single-writer lock for the JSONL event storage directory.
 *
 * The server persists events/approvals to `<storageDir>/events.jsonl`. Running
 * two server instances against the same storage dir interleaves their writes
 * and corrupts approval state — observed in practice: an approval granted by
 * one instance is "not found" by the other, so an approved tmux dispatch is
 * rejected as a bypass attempt.
 *
 * This is an *advisory* guard, not a hard mutex: on startup the server records
 * a lock file with its pid; if another live process already holds the dir it
 * warns loudly (or refuses, in strict mode) instead of silently corrupting
 * shared state. A lock left by a dead process is taken over automatically.
 *
 * The decision is pure (`evaluateStorageLock`) so it is fully unit-tested; the
 * fs/pid effects in `acquireStorageLock` are injectable for the same reason.
 */

export type StorageLockRecord = {
  pid: number;
  port?: number;
  host?: string;
  acquiredAt: string;
};

export type StorageLockAction = "acquire" | "takeover_stale" | "contended";

export type StorageLockDecision = {
  action: StorageLockAction;
  reason: string;
};

/**
 * Decide whether this process may own the storage dir. Liveness of the current
 * holder is authoritative: a live holder means contention; a dead holder's lock
 * is stale and can be taken over.
 */
export function evaluateStorageLock(input: {
  existingLock: StorageLockRecord | null;
  selfPid: number;
  isPidAlive: (pid: number) => boolean;
}): StorageLockDecision {
  const { existingLock, selfPid, isPidAlive } = input;
  if (!existingLock) {
    return { action: "acquire", reason: "no existing lock" };
  }
  if (existingLock.pid === selfPid) {
    return { action: "acquire", reason: "re-acquiring own lock" };
  }
  if (!isPidAlive(existingLock.pid)) {
    return { action: "takeover_stale", reason: `previous holder pid ${existingLock.pid} is no longer running` };
  }
  return {
    action: "contended",
    reason: `event storage dir is already held by a live process (pid ${existingLock.pid}${
      existingLock.port ? `, port ${existingLock.port}` : ""
    })`,
  };
}

/** Default pid-liveness probe. process.kill(pid, 0) throws ESRCH if the pid is gone. */
export function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but we can't signal it — still alive.
    return (error as { code?: string }).code === "EPERM";
  }
}

export type AcquireStorageLockResult = {
  acquired: boolean;
  decision: StorageLockDecision;
};

/**
 * Read the lock file, decide, and (when allowed) write our own lock record.
 * On contention: warn and proceed without stealing the lock (advisory), or
 * throw when `strict` is set. Never overwrites a live holder's lock.
 */
export async function acquireStorageLock(input: {
  lockPath: string;
  selfPid?: number;
  port?: number;
  host?: string;
  strict?: boolean;
  now?: () => string;
  isPidAlive?: (pid: number) => boolean;
  readFileImpl?: (path: string) => Promise<string>;
  writeFileImpl?: (path: string, content: string) => Promise<void>;
  logger?: (message: string) => void;
}): Promise<AcquireStorageLockResult> {
  const selfPid = input.selfPid ?? process.pid;
  const now = input.now ?? (() => new Date().toISOString());
  const isPidAlive = input.isPidAlive ?? defaultIsPidAlive;
  const readFileImpl = input.readFileImpl ?? ((path) => readFile(path, "utf8"));
  const writeFileImpl = input.writeFileImpl ?? ((path, content) => writeFile(path, content, "utf8"));
  const logger = input.logger ?? ((message) => console.warn(message));

  const existingLock = await readLockRecord(input.lockPath, readFileImpl);
  const decision = evaluateStorageLock({ existingLock, selfPid, isPidAlive });

  if (decision.action === "contended") {
    const message = `[orchestrator-server] ${decision.reason}. Running a second instance against the same EVENT_STORAGE_DIR will corrupt approval state; point this instance at a different EVENT_STORAGE_DIR.`;
    if (input.strict) {
      throw new Error(message);
    }
    logger(message);
    return { acquired: false, decision };
  }

  const record: StorageLockRecord = { pid: selfPid, port: input.port, host: input.host, acquiredAt: now() };
  try {
    await writeFileImpl(input.lockPath, `${JSON.stringify(record)}\n`);
    return { acquired: true, decision };
  } catch (error) {
    // Writing the advisory lock must never take the server down. Log and carry
    // on without owning the lock — this is a best-effort guard, not a mutex.
    logger(
      `[orchestrator-server] could not write event storage lock: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { acquired: false, decision };
  }
}

async function readLockRecord(
  lockPath: string,
  readFileImpl: (path: string) => Promise<string>,
): Promise<StorageLockRecord | null> {
  let raw: string;
  try {
    raw = await readFileImpl(lockPath);
  } catch {
    // Missing OR unreadable lock -> treat as absent. A read error must not
    // crash startup; the worst case is we proceed without seeing a lock.
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StorageLockRecord>;
    if (typeof parsed.pid !== "number" || typeof parsed.acquiredAt !== "string") {
      return null;
    }
    return { pid: parsed.pid, port: parsed.port, host: parsed.host, acquiredAt: parsed.acquiredAt };
  } catch {
    // A corrupt/partial lock file is treated as absent so a healthy server can recover.
    return null;
  }
}
