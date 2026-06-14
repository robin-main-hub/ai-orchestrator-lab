import type { GithubPullRequestUpdatePlan } from "@ai-orchestrator/protocol";

/**
 * W5c PR title/body update plan store. plan put/get + tryClaim/release + markUpdated.
 * 영속화하지 않는 이유: plan은 작업 의도이며 진실(observed)이 아니다 — 재시작 후엔 다시 plan.
 *
 * 저장하는 부가 데이터:
 *   - newTitle/newBody: execute(W5c)가 PATCH /pulls/:n로 보낼 원본. plan 응답엔 excerpt/sha만 노출.
 *   - currentTitle/currentBody: TOCTOU 재검증용(execute 시점에 다시 GET해서 일치 여부 확인).
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GithubPullRequestUpdatePlanRecord = {
  plan: GithubPullRequestUpdatePlan;
  /** PATCH로 보낼 새 title(있을 때만). raw 그대로 — 응답엔 노출 X. */
  newTitle?: string;
  /** PATCH로 보낼 새 body(있을 때만). raw 그대로 — 응답엔 excerpt만 노출. */
  newBody?: string;
};

export type GithubPullRequestUpdateObserved = {
  pullNumber: number;
  htmlUrl: string;
  title: string;
  bodyLength: number;
  bodySha256: string;
  updatedAt: string;
  observedAt: string;
};

export type GithubPullRequestUpdatePlanStore = {
  put(record: GithubPullRequestUpdatePlanRecord): void;
  get(id: string): GithubPullRequestUpdatePlanRecord | undefined;
  /** W5c — PATCH 직전 동기 점유. 같은 planId 동시 execute의 두 번째 호출은 false. */
  tryClaim(id: string): boolean;
  /** W5c — PATCH 실패 시 점유 해제(같은 plan 재시도 가능). */
  release(id: string): void;
  /** W5c — execute 성공 후 멱등 보장. 같은 plan으로 두 번 PATCH되지 않게. */
  markUpdated(id: string, observation: GithubPullRequestUpdateObserved): void;
  prune(now?: number): void;
};

const observedCache = new Map<string, GithubPullRequestUpdateObserved>();

export function getPullRequestUpdateObservedFor(
  planId: string,
): GithubPullRequestUpdateObserved | undefined {
  return observedCache.get(planId);
}

export function clearPullRequestUpdateObservedCache(): void {
  observedCache.clear();
}

export function createGithubPullRequestUpdatePlanStore(
  options: { ttlMs?: number; nowMs?: () => number } = {},
): GithubPullRequestUpdatePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const records = new Map<string, { record: GithubPullRequestUpdatePlanRecord; expiresAtMs: number }>();
  const inFlight = new Set<string>();

  const prune = (atMs?: number) => {
    const t = atMs ?? nowMs();
    for (const [id, entry] of records) {
      if (entry.expiresAtMs <= t) records.delete(id);
    }
  };

  return {
    put(record) {
      prune();
      const expiresAtMs = Date.parse(record.plan.expiresAt) || nowMs() + ttl;
      records.set(record.plan.id, { record, expiresAtMs });
    },
    get(id) {
      prune();
      return records.get(id)?.record;
    },
    tryClaim(id) {
      if (inFlight.has(id) || observedCache.has(id)) return false;
      inFlight.add(id);
      return true;
    },
    release(id) {
      inFlight.delete(id);
    },
    markUpdated(id, observation) {
      const entry = records.get(id);
      if (entry) {
        entry.record.plan = { ...entry.record.plan, truthStatus: "observed" };
      }
      observedCache.set(id, observation);
      inFlight.delete(id);
    },
    prune,
  };
}
