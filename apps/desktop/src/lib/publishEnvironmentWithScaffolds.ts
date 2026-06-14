import type { MissionPublishEnvironment } from "../components/MissionBoardPanel";
import type { MissionBoardItem } from "./missionBoardModel";
import type { MissionScaffoldFile } from "./missionPublishPrefill";

/**
 * publishEnvironment에 컨테이너 측 scaffold 캐시를 합쳐 주는 순수 함수.
 *
 * 정직성 규칙:
 *   - base가 없으면 undefined를 그대로 반환(노출 안 함).
 *   - base가 직접 getScaffoldFiles를 갖고 있으면 그대로 보존(테스트/override 우선).
 *     이 길은 prefill 컨트랙트가 절대 부모 의도를 덮어쓰지 않도록 보장한다.
 *   - 둘 다 아닌 경우에만 cache 조회로 폴백한다. cache에 없으면 undefined(추측 금지).
 *
 * 새 함수가 추가됐다고 해서 새 GitHub write 표면이 생기는 것은 아니다 — 이 함수는
 * publishEnvironment 모양만 바꾼다(읽기 전용 prefill 자료원 연결).
 */
export function publishEnvironmentWithScaffolds(
  base: MissionPublishEnvironment | undefined,
  cache: Readonly<Record<string, ReadonlyArray<MissionScaffoldFile>>>,
): MissionPublishEnvironment | undefined {
  if (!base) return undefined;
  if (base.getScaffoldFiles) return base;
  return {
    ...base,
    getScaffoldFiles: (item: MissionBoardItem) => cache[item.missionId],
  };
}
