import type { GithubCommentWritePlan } from "@ai-orchestrator/protocol";

/**
 * In-process plan store for W1. Plans are short-lived(10분 만료) plan→execute 무결성 검증의
 * 한쪽 끝이며, 다른 한쪽은 클라이언트가 다시 보낸 bodySha256이다. 둘이 일치할 때만 실제 게시.
 * 영속화하지 않는 이유: plan은 작업 의도일 뿐 진실(observed)이 아니다 — 재시작 후엔 다시 plan하라.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GithubCommentWritePlanRecord = {
  plan: GithubCommentWritePlan;
  /** plan 시점에 서버가 계산한 sha — execute 시 입력과 일치해야 함 */
  bodySha256: z_sha;
  /** preview를 만들기 전의 raw body — execute 시 실제로 POST할 본문 */
  body: string;
};
type z_sha = string;

export type GithubCommentWritePlanStore = {
  put(record: GithubCommentWritePlanRecord): void;
  get(id: string): GithubCommentWritePlanRecord | undefined;
  /**
   * 동시 execute 경쟁 차단 — POST 직전에 동기로 점유한다. 같은 planId로 들어온 두 번째
   * 호출은 false를 받아 차단된다. release/markCreated 호출 전까지 점유가 풀리지 않는다.
   * Node가 단일 스레드라 단순 Map 체크/세트로 충분(IO 경계 직전 점유, await 이후 해제).
   */
  tryClaim(id: string): boolean;
  /** 게시 실패 시 점유 해제 — 일시적 GitHub 오류 후 재시도 허용. */
  release(id: string): void;
  /** execute 성공 후 멱등 보장을 위해 상태를 갱신 — 같은 plan으로 두 번 POST되지 않게. */
  markCreated(id: string, observation: { commentId: number; htmlUrl: string; observedAt: string }): void;
  /** 만료된 항목 정리(테스트/리소스 누수 방지). */
  prune(now?: number): void;
};

export function createGithubCommentWritePlanStore(options: { ttlMs?: number; nowMs?: () => number } = {}): GithubCommentWritePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  // expiresAt은 plan.expiresAt(ISO)을 기준으로 epoch ms로 캐시
  const records = new Map<string, { record: GithubCommentWritePlanRecord; expiresAtMs: number }>();
  // in-flight 점유 — POST 직전 동기 점유 → markCreated/release에서만 해제.
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
      entry.record.plan = {
        ...entry.record.plan,
        status: "created",
        truthStatus: "observed",
      };
      // 멱등 보장을 위해 결과를 plan에 묶지 않고 별도 캐시
      observedCache.set(id, observation);
      inFlight.delete(id);
    },
    prune,
  };
}

const observedCache = new Map<string, { commentId: number; htmlUrl: string; observedAt: string }>();

export function getObservedFor(planId: string): { commentId: number; htmlUrl: string; observedAt: string } | undefined {
  return observedCache.get(planId);
}
