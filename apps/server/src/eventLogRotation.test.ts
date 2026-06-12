import { describe, expect, it } from "vitest";
import {
  ACTIVE_EVENT_LOG,
  isEventLogFile,
  orderLogFilesOldestFirst,
  parseSegmentMs,
  rotatedSegmentName,
  segmentsToPrune,
  shouldRotateEventLog,
} from "./eventLogRotation";

describe("shouldRotateEventLog", () => {
  it("rotates at or above the threshold, never with a non-positive max", () => {
    expect(shouldRotateEventLog(64, 64)).toBe(true);
    expect(shouldRotateEventLog(65, 64)).toBe(true);
    expect(shouldRotateEventLog(63, 64)).toBe(false);
    expect(shouldRotateEventLog(1_000, 0)).toBe(false); // 0 = 회전 비활성
  });
});

describe("segment naming", () => {
  it("round-trips a millisecond timestamp", () => {
    expect(rotatedSegmentName(1781282329291)).toBe("events.1781282329291.jsonl");
    expect(parseSegmentMs("events.1781282329291.jsonl")).toBe(1781282329291);
  });

  it("rejects non-segment names", () => {
    expect(parseSegmentMs(ACTIVE_EVENT_LOG)).toBeNull();
    expect(parseSegmentMs("events.jsonl.bak")).toBeNull();
    expect(parseSegmentMs("random.txt")).toBeNull();
  });

  it("recognizes both the active file and rotated segments", () => {
    expect(isEventLogFile("events.jsonl")).toBe(true);
    expect(isEventLogFile("events.123.jsonl")).toBe(true);
    expect(isEventLogFile("notes.md")).toBe(false);
  });
});

describe("orderLogFilesOldestFirst", () => {
  it("orders segments oldest→newest with the active file last (newest)", () => {
    const order = orderLogFilesOldestFirst([
      "events.jsonl",
      "events.300.jsonl",
      "events.100.jsonl",
      "events.200.jsonl",
      "unrelated.txt",
    ]);
    expect(order).toEqual([
      "events.100.jsonl",
      "events.200.jsonl",
      "events.300.jsonl",
      "events.jsonl",
    ]);
  });

  it("handles a fresh dir with only the active file (or none)", () => {
    expect(orderLogFilesOldestFirst(["events.jsonl"])).toEqual(["events.jsonl"]);
    expect(orderLogFilesOldestFirst([])).toEqual([]);
  });
});

describe("segmentsToPrune", () => {
  it("drops the oldest segments beyond the keep limit, never the active file", () => {
    const names = [
      "events.jsonl",
      "events.100.jsonl",
      "events.200.jsonl",
      "events.300.jsonl",
      "events.400.jsonl",
    ];
    expect(segmentsToPrune(names, 2)).toEqual(["events.100.jsonl", "events.200.jsonl"]);
    expect(segmentsToPrune(names, 4)).toEqual([]); // 정확히 한도면 보존
    expect(segmentsToPrune(names, 0)).toEqual([
      "events.100.jsonl",
      "events.200.jsonl",
      "events.300.jsonl",
      "events.400.jsonl",
    ]);
  });

  it("never returns the active file even when keep is zero", () => {
    expect(segmentsToPrune(["events.jsonl"], 0)).toEqual([]);
  });
});
