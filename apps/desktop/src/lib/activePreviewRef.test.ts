import { describe, expect, it } from "vitest";
import { putPreviewRef, resolvePreviewRef, type ActivePreviewRefMap } from "./activePreviewRef";

const refA1 = { missionId: "A", url: "http://a/1", observedAt: "2026-06-16T00:00:01.000Z" };
const refA2 = { missionId: "A", url: "http://a/2", observedAt: "2026-06-16T00:00:02.000Z" };
const refB = { missionId: "B", url: "http://b/1", observedAt: "2026-06-16T00:00:03.000Z" };

describe("activePreviewRef map", () => {
  it("missionId별로 분리 보관", () => {
    let map: ActivePreviewRefMap = {};
    map = putPreviewRef(map, refA1);
    map = putPreviewRef(map, refB);
    expect(resolvePreviewRef(map, "A")?.url).toBe("http://a/1");
    expect(resolvePreviewRef(map, "B")?.url).toBe("http://b/1");
  });

  it("같은 미션은 더 최신 observedAt만 덮어씀", () => {
    let map: ActivePreviewRefMap = {};
    map = putPreviewRef(map, refA2);
    map = putPreviewRef(map, refA1); // 더 옛 관측 — 무시돼야
    expect(resolvePreviewRef(map, "A")?.url).toBe("http://a/2");
  });

  it("다른 미션 URL로 폴백하지 않음 (stale 방지)", () => {
    let map: ActivePreviewRefMap = {};
    map = putPreviewRef(map, refB);
    expect(resolvePreviewRef(map, "A")).toBeUndefined(); // A 관측 없음 → B로 새지 않음
    expect(resolvePreviewRef(map, undefined)).toBeUndefined();
  });
});
