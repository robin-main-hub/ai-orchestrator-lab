/**
 * 이벤트 로그(events.jsonl) 로테이션의 순수 결정 로직.
 *
 * 서버는 events.jsonl에 append만 하고 로테이션이 없어 파일이 무한히 자란다
 * (실측: dgx에서 며칠 만에 92MB). 그대로 두면 부팅 시 전체 파일을 메모리로
 * 읽는 비용이 커지다 결국 디스크 고갈/OOM으로 백엔드가 먹통이 된다.
 *
 * 정책: 활성 파일이 maxBytes에 닿으면 타임스탬프 세그먼트로 회전하고, 보관
 * 세그먼트 수를 제한해 디스크 사용량에 상한을 둔다. 부팅 시에는 모든 세그먼트를
 * 오래된 것부터 읽어 상태를 온전히 복원하므로 데이터 유실이 없다(prune로
 * 만료된 아주 오래된 세그먼트만 제외).
 *
 * I/O(실제 rename/unlink/stream)는 호출부가 담당하고, 여기서는 "회전할지",
 * "세그먼트 순서", "무엇을 지울지"만 계산한다 — 그래서 파일 시스템 없이 테스트된다.
 */

/** 활성 로그 파일명 (회전되지 않은 현재 쓰기 대상) */
export const ACTIVE_EVENT_LOG = "events.jsonl";

/** 회전된 세그먼트: events.<밀리초>.jsonl */
const SEGMENT_RE = /^events\.(\d+)\.jsonl$/;

/** 기본 회전 임계 64MB — 부팅 파싱 비용과 회전 빈도의 절충 */
export const DEFAULT_EVENT_LOG_MAX_BYTES = 64 * 1024 * 1024;

/** 기본 보관 세그먼트 16개 → 활성 포함 약 1GB 상한, 수개월~수년치 보존 */
export const DEFAULT_EVENT_LOG_KEEP_SEGMENTS = 16;

export function shouldRotateEventLog(activeSizeBytes: number, maxBytes: number): boolean {
  return maxBytes > 0 && activeSizeBytes >= maxBytes;
}

/** 회전 시 활성 파일이 옮겨갈 세그먼트 이름. 같은 ms 충돌은 호출부가 ms+1로 회피한다. */
export function rotatedSegmentName(nowMs: number): string {
  return `events.${nowMs}.jsonl`;
}

/** 세그먼트 파일명에서 ms를 뽑는다. 세그먼트가 아니면 null. */
export function parseSegmentMs(fileName: string): number | null {
  const match = SEGMENT_RE.exec(fileName);
  return match ? Number(match[1]) : null;
}

export function isEventLogFile(fileName: string): boolean {
  return fileName === ACTIVE_EVENT_LOG || SEGMENT_RE.test(fileName);
}

/**
 * 부팅 시 읽을 순서: 회전 세그먼트를 오래된→최신(ms 오름차순)으로, 그다음
 * 활성 파일(가장 최신). dedup이 첫 등장 레코드를 유지하므로 시간순 복원이 된다.
 */
export function orderLogFilesOldestFirst(fileNames: ReadonlyArray<string>): string[] {
  const segments = fileNames
    .filter((name) => SEGMENT_RE.test(name))
    .sort((a, b) => (parseSegmentMs(a) ?? 0) - (parseSegmentMs(b) ?? 0));
  const active = fileNames.includes(ACTIVE_EVENT_LOG) ? [ACTIVE_EVENT_LOG] : [];
  return [...segments, ...active];
}

/**
 * 보관 한도를 넘긴 가장 오래된 세그먼트들(삭제 대상). 활성 파일은 절대 대상이
 * 아니다. keepSegments개의 최신 세그먼트는 남긴다.
 */
export function segmentsToPrune(fileNames: ReadonlyArray<string>, keepSegments: number): string[] {
  const segments = fileNames
    .filter((name) => SEGMENT_RE.test(name))
    .sort((a, b) => (parseSegmentMs(a) ?? 0) - (parseSegmentMs(b) ?? 0));
  const keep = Math.max(0, keepSegments);
  const excess = segments.length - keep;
  return excess > 0 ? segments.slice(0, excess) : [];
}
