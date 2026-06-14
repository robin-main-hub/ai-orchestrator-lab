import type { GithubPullRequestLabelsUpdatePlan } from "@ai-orchestrator/protocol";

/**
 * W5d-Phase-1 PR labels update plan store. 10분 TTL + put/get + tryClaim/release/markUpdated.
 * 영속화 X — plan은 의도, 진실(observed)이 아니다.
 *
 * 저장 부가:
 *   - addLabels/removeLabels: execute가 final desired set을 다시 계산할 때 쓴다(서버 측 재검증용).
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GithubPullRequestLabelsUpdatePlanRecord = {
  plan: GithubPullRequestLabelsUpdatePlan;
  addLabels: ReadonlyArray<string>;
  removeLabels: ReadonlyArray<string>;
};

export type GithubPullRequestLabelsUpdateObserved = {
  pullNumber: number;
  htmlUrl: string;
  appliedLabels: ReadonlyArray<string>;
  observedAt: string;
};

export type GithubPullRequestLabelsUpdatePlanStore = {
  put(record: GithubPullRequestLabelsUpdatePlanRecord): void;
  get(id: string): GithubPullRequestLabelsUpdatePlanRecord | undefined;
  tryClaim(id: string): boolean;
  release(id: string): void;
  markUpdated(id: string, observation: GithubPullRequestLabelsUpdateObserved): void;
  prune(now?: number): void;
};

const observedCache = new Map<string, GithubPullRequestLabelsUpdateObserved>();

export function getPullRequestLabelsObservedFor(
  planId: string,
): GithubPullRequestLabelsUpdateObserved | undefined {
  return observedCache.get(planId);
}

export function clearPullRequestLabelsObservedCache(): void {
  observedCache.clear();
}

export function createGithubPullRequestLabelsUpdatePlanStore(
  options: { ttlMs?: number; nowMs?: () => number } = {},
): GithubPullRequestLabelsUpdatePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const records = new Map<string, { record: GithubPullRequestLabelsUpdatePlanRecord; expiresAtMs: number }>();
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
