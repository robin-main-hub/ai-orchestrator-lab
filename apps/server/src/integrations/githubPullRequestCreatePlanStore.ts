import type { GithubPullRequestCreatePlan } from "@ai-orchestrator/protocol";

/**
 * W4a PR create plan store — W3a와 동일한 in-memory + TTL 패턴.
 * W4a에서는 execute가 없으므로 tryClaim/markCreated는 없다(W4b에서 확장).
 * 영속화하지 않는 이유: plan은 작업 의도이며 진실(observed)이 아니다. 재시작 후엔 다시 plan.
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

export type GithubPullRequestCreatePlanStore = {
  put(record: GithubPullRequestCreatePlanRecord): void;
  get(id: string): GithubPullRequestCreatePlanRecord | undefined;
  prune(now?: number): void;
};

export function createGithubPullRequestCreatePlanStore(
  options: { ttlMs?: number; nowMs?: () => number } = {},
): GithubPullRequestCreatePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const records = new Map<string, { record: GithubPullRequestCreatePlanRecord; expiresAtMs: number }>();

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
    prune,
  };
}
