export interface ActivePreviewRef {
  missionId: string;
  url: string;
  observedAt: string;
}

/**
 * observed preview URL을 missionId별로 보관한다. 단일 "마지막 observed" 값만 두면
 * 미션을 오갈 때 다른 미션의 URL이 stale하게 보이는데(핸드오프가 짚은 버그),
 * 맵으로 두고 현재 미션 키로만 조회하면 그 staleness가 사라진다.
 */
export type ActivePreviewRefMap = Record<string, ActivePreviewRef>;

/** observed ref를 missionId 키로 적재 (더 최신 observedAt만 덮어씀 — 늦게 도착한 옛 관측 방지) */
export function putPreviewRef(map: ActivePreviewRefMap, ref: ActivePreviewRef): ActivePreviewRefMap {
  const existing = map[ref.missionId];
  if (existing && existing.observedAt > ref.observedAt) return map;
  return { ...map, [ref.missionId]: ref };
}

/** 현재 미션의 ref만 — missionId 없거나 해당 미션 관측이 없으면 undefined(다른 미션 URL로 폴백 금지) */
export function resolvePreviewRef(map: ActivePreviewRefMap, missionId?: string): ActivePreviewRef | undefined {
  if (!missionId) return undefined;
  return map[missionId];
}
