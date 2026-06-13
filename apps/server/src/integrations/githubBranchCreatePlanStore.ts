import type { GithubBranchCreatePlan } from "@ai-orchestrator/protocol";

/**
 * W2 branch create plan store — W1 comment write store와 동일 패턴(in-process, TTL 10분,
 * tryClaim 동기 점유, observedCache 멱등). 둘을 별도 인스턴스로 두는 이유:
 *   - 두 write surface(comment / branch create)가 서로 다른 plan 라이프사이클을 가질 수 있고,
 *   - 한쪽이 비정상 상태에 빠져도 다른 쪽에 영향을 주지 않게 격리한다.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GithubBranchCreatePlanRecord = {
  plan: GithubBranchCreatePlan;
  /** plan 시점 source ref sha — execute가 이 값과 일치해야 함(client·재GET 양쪽). */
  sourceSha: string;
};

export type GithubBranchCreatePlanStore = {
  put(record: GithubBranchCreatePlanRecord): void;
  get(id: string): GithubBranchCreatePlanRecord | undefined;
  tryClaim(id: string): boolean;
  release(id: string): void;
  markCreated(id: string, observation: { ref: string; sha: string; htmlUrl: string; observedAt: string }): void;
  prune(now?: number): void;
};

const observedCache = new Map<string, { ref: string; sha: string; htmlUrl: string; observedAt: string }>();

export function getBranchObservedFor(planId: string) {
  return observedCache.get(planId);
}

export function createGithubBranchCreatePlanStore(
  options: { ttlMs?: number; nowMs?: () => number } = {},
): GithubBranchCreatePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const records = new Map<string, { record: GithubBranchCreatePlanRecord; expiresAtMs: number }>();
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
    markCreated(id, observation) {
      const entry = records.get(id);
      if (!entry) return;
      entry.record.plan = { ...entry.record.plan, status: "created", truthStatus: "observed" };
      observedCache.set(id, observation);
      inFlight.delete(id);
    },
    prune,
  };
}
