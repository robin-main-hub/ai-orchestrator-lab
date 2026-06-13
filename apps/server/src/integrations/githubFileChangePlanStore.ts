import type { GithubFileChangePlan } from "@ai-orchestrator/protocol";

/**
 * W3a/W3b file change plan store. W3a는 plan put/get만 쓰고,
 * W3b execute는 tryClaim/release/markCreated로 동시 PUT 중복을 차단한다.
 * 영속화하지 않는 이유: plan은 작업 의도일 뿐 진실(observed)이 아니다 — 재시작 후엔 다시 plan.
 *
 * 저장하는 부가 데이터:
 *   - newContent: execute(W3b)가 GitHub PUT으로 보낼 본문. 응답엔 미포함.
 *   - baseContent: plan 시점 observed base 콘텐츠(create면 ""). W3b가 base sha 재확인 시 사용.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GithubFileChangePlanRecord = {
  plan: GithubFileChangePlan;
  /** 새 콘텐츠 — execute(W3b)에서 PUT body로 사용. plan 응답엔 포함되지 않는다. */
  newContent: string;
  /** plan 시점에 GitHub에서 observed한 base 콘텐츠(create면 ""). W3b에서 base sha 재확인 시 사용. */
  baseContent: string;
};

export type GithubFileChangeObserved = {
  commitSha: string;
  blobSha: string;
  htmlUrl: string;
  observedAt: string;
};

export type GithubFileChangePlanStore = {
  put(record: GithubFileChangePlanRecord): void;
  get(id: string): GithubFileChangePlanRecord | undefined;
  /** W3b — POST 직전 동기 점유. 같은 planId 동시 execute의 두 번째 호출은 false. */
  tryClaim(id: string): boolean;
  /** W3b — PUT 실패 시 점유 해제(같은 sha 재시도 가능). */
  release(id: string): void;
  /** W3b — execute 성공 후 멱등 보장. 같은 plan으로 두 번 PUT되지 않게. */
  markCreated(id: string, observation: GithubFileChangeObserved): void;
  prune(now?: number): void;
};

/** 멱등성 캐시는 store 인스턴스 외부에 둬 'plan store 비움'과 분리(테스트 환경 cross-test 영향 차단). */
const observedCache = new Map<string, GithubFileChangeObserved>();

export function getFileChangeObservedFor(planId: string): GithubFileChangeObserved | undefined {
  return observedCache.get(planId);
}

export function createGithubFileChangePlanStore(
  options: { ttlMs?: number; nowMs?: () => number } = {},
): GithubFileChangePlanStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const records = new Map<string, { record: GithubFileChangePlanRecord; expiresAtMs: number }>();
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
        // status는 GithubFileChangePlan 스키마상 created가 없으므로 truthStatus만 갱신.
        entry.record.plan = { ...entry.record.plan, truthStatus: "observed" };
      }
      observedCache.set(id, observation);
      inFlight.delete(id);
    },
    prune,
  };
}
