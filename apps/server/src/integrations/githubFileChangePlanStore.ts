import type { GithubFileChangePlan } from "@ai-orchestrator/protocol";

/**
 * W3a file change plan store — W1/W2와 동일한 in-memory + TTL 패턴.
 * W3a에서는 execute가 없으므로 tryClaim/markCreated는 제공하지 않는다(W3b에서 확장).
 * 영속화하지 않는 이유: plan은 작업 의도이며 진실(observed)이 아니다. 재시작 후엔 다시 plan.
 *
 * 저장하는 부가 데이터:
 *   - newContent: execute(W3b)가 GitHub PUT으로 보낼 본문. 서버 내부에만 남고 응답엔 미포함.
 *   - baseContent: plan 시점에 GitHub에서 read한 원본(create면 빈 문자열). W3b에서 base sha 재확인 용도.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GithubFileChangePlanRecord = {
  plan: GithubFileChangePlan;
  /** 새 콘텐츠 — execute(W3b)에서 PUT body로 사용. plan 응답엔 포함되지 않는다. */
  newContent: string;
  /** plan 시점에 GitHub에서 observed한 base 콘텐츠(create면 ""). W3b에서 base sha 재확인 시 사용. */
  baseContent: string;
};

export type GithubFileChangePlanStore = {
  put(record: GithubFileChangePlanRecord): void;
  get(id: string): GithubFileChangePlanRecord | undefined;
  prune(now?: number): void;
};

export function createGithubFileChangePlanStore(
  options: { ttlMs?: number; nowMs?: () => number } = {},
): GithubFileChangePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const records = new Map<string, { record: GithubFileChangePlanRecord; expiresAtMs: number }>();

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
