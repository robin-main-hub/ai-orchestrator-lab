import type { RunningWorkItem } from "./RunningWorkCard";

/**
 * 홈 "현재 작업" 카드에 여러 실행 소스(RMAS 서버 폴링, 브라우저 autonomy 실행)를
 * 합쳐 꽂기 위한 순수 병합기. 중지는 그 항목을 소유한 소스로만 라우팅한다 —
 * 잘못 라우팅하면 엉뚱한 실행이 죽으므로 소유(items 포함) 기준으로만 찾는다.
 */
export type RunningWorkSource = {
  items: RunningWorkItem[];
  stoppingIds: string[];
  stop: (id: string) => void;
};

export function mergeRunningWork(sources: ReadonlyArray<RunningWorkSource>): RunningWorkSource {
  return {
    items: sources.flatMap((source) => source.items),
    stoppingIds: sources.flatMap((source) => source.stoppingIds),
    stop: (id) => {
      sources.find((source) => source.items.some((item) => item.id === id))?.stop(id);
    },
  };
}
