import type { GithubPullRequestCreatePlan } from "@ai-orchestrator/protocol";

/**
 * W4a/W4b PR create plan store. W4a는 plan put/get만 쓰고,
 * W4b execute는 tryClaim/release/markCreated로 동시 PUT 중복을 차단한다.
 * 영속화하지 않는 이유: plan은 작업 의도이며 진실(observed)이 아니다 — 재시작 후엔 다시 plan.
 *
 * 저장하는 부가 데이터:
 *   - title/body: execute(W4b)가 POST /pulls로 보낼 원본. plan 응답엔 preview만 노출.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GithubPullRequestCreatePlanRecord = {
  plan: GithubPullRequestCreatePlan;
  /** 원본 title — execute(W4b)에서 GitHub로 보낼 텍스트. */
  title: string;
  /** 원본 body — execute(W4b)에서 GitHub로 보낼 텍스트. */
  body: string;
};

export type GithubPullRequestCreateObserved = {
  pullNumber: number;
  htmlUrl: string;
  headSha: string;
  observedAt: string;
};

export type GithubPullRequestCreatePlanStore = {
  put(record: GithubPullRequestCreatePlanRecord): void;
  get(id: string): GithubPullRequestCreatePlanRecord | undefined;
  /** W4b — POST 직전 동기 점유. 같은 planId 동시 execute의 두 번째 호출은 false. */
  tryClaim(id: string): boolean;
  /** W4b — POST 실패 시 점유 해제(같은 plan 재시도 가능). */
  release(id: string): void;
  /** W4b — execute 성공 후 멱등 보장. 같은 plan으로 두 번 POST되지 않게. */
  markCreated(id: string, observation: GithubPullRequestCreateObserved): void;
  prune(now?: number): void;
};

/** 멱등성 캐시는 store 인스턴스 외부에 둬 'plan store 비움'과 분리. */
const observedCache = new Map<string, GithubPullRequestCreateObserved>();

export function getPullRequestObservedFor(planId: string): GithubPullRequestCreateObserved | undefined {
  return observedCache.get(planId);
}

export function createGithubPullRequestCreatePlanStore(
  options: { ttlMs?: number; nowMs?: () => number } = {},
): GithubPullRequestCreatePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const records = new Map<string, { record: GithubPullRequestCreatePlanRecord; expiresAtMs: number }>();
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
      if (entry) {
        entry.record.plan = { ...entry.record.plan, truthStatus: "observed" };
      }
      observedCache.set(id, observation);
      inFlight.delete(id);
    },
    prune,
  };
}
