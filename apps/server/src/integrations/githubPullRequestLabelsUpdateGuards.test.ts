import { describe, expect, it } from "vitest";
import {
  PR_LABEL_NAME_MAX_CHARS,
  PR_LABELS_MAX_CHANGE,
  computeLabelDiff,
  evaluatePrLabelsUpdateGate,
  hashLabelSet,
} from "./githubPullRequestLabelsUpdateGuards";

const allow = ["robin/lab"];
const base = {
  repoFullName: "robin/lab",
  pullNumber: 7,
  addLabels: ["bug"],
  removeLabels: [],
  allowlist: allow,
  tokenPresent: true,
};

describe("evaluatePrLabelsUpdateGate — 안전선", () => {
  it("정상 입력은 ok + 정규화(중복 제거)", () => {
    const g = evaluatePrLabelsUpdateGate({ ...base, addLabels: ["bug", "bug", " bug "] });
    expect(g.kind).toBe("ok");
    if (g.kind === "ok") expect(g.addLabels).toEqual(["bug"]);
  });

  it("토큰 없음 / allowlist 비어 있음 / 미허용 repo → blocked(allowlist)", () => {
    expect(evaluatePrLabelsUpdateGate({ ...base, tokenPresent: false }).kind).toBe("blocked");
    expect(evaluatePrLabelsUpdateGate({ ...base, allowlist: [] }).kind).toBe("blocked");
    const other = evaluatePrLabelsUpdateGate({ ...base, repoFullName: "evil/repo" });
    expect(other).toMatchObject({ kind: "blocked", reason: "allowlist" });
  });

  it("add/remove 둘 다 비면 empty_change", () => {
    expect(evaluatePrLabelsUpdateGate({ ...base, addLabels: [], removeLabels: [] })).toMatchObject({
      kind: "blocked",
      reason: "empty_change",
    });
  });

  it("한 번에 20개 초과면 labels_too_many", () => {
    const many = Array.from({ length: PR_LABELS_MAX_CHANGE + 1 }, (_, i) => `l${i}`);
    expect(evaluatePrLabelsUpdateGate({ ...base, addLabels: many })).toMatchObject({
      kind: "blocked",
      reason: "labels_too_many",
    });
  });

  it("이름 길이 초과 / 빈 이름 → label_too_long", () => {
    expect(evaluatePrLabelsUpdateGate({ ...base, addLabels: ["x".repeat(PR_LABEL_NAME_MAX_CHARS + 1)] })).toMatchObject({
      kind: "blocked",
      reason: "label_too_long",
    });
    expect(evaluatePrLabelsUpdateGate({ ...base, addLabels: ["   "] })).toMatchObject({
      kind: "blocked",
      reason: "label_too_long",
    });
  });

  it("라벨 이름에 secret 패턴이 있으면 secret_suspect", () => {
    // 라벨 이름 cap(50자) 아래여야 secret 스캔까지 도달 — classic ghp_ 토큰(런타임 조합).
    const tok = "ghp" + "_" + "A".repeat(24);
    expect(evaluatePrLabelsUpdateGate({ ...base, addLabels: [tok] })).toMatchObject({
      kind: "blocked",
      reason: "secret_suspect",
    });
  });
});

describe("hashLabelSet — 순서 무관 결정적", () => {
  it("정렬 후 해시 — 순서가 달라도 같은 집합은 같은 해시", () => {
    expect(hashLabelSet(["b", "a"])).toBe(hashLabelSet(["a", "b"]));
    expect(hashLabelSet(["a"])).not.toBe(hashLabelSet(["a", "b"]));
  });
});

describe("computeLabelDiff", () => {
  it("기본 add/remove를 현재 라벨에 반영", () => {
    const d = computeLabelDiff(["bug"], ["enhancement"], ["bug"]);
    expect(d.finalLabels).toEqual(["enhancement"]);
    expect(d.actuallyAdded).toEqual(["enhancement"]);
    expect(d.actuallyRemoved).toEqual(["bug"]);
  });

  it("이미 있는 라벨 add / 없는 라벨 remove는 noop", () => {
    const d = computeLabelDiff(["bug"], ["bug"], ["ghost"]);
    expect(d.finalLabels).toEqual(["bug"]);
    expect(d.actuallyAdded).toEqual([]);
    expect(d.actuallyRemoved).toEqual([]);
    expect(d.noopAdd).toEqual(["bug"]);
    expect(d.noopRemove).toEqual(["ghost"]);
  });

  it("remove가 add보다 우세 — 현재 있는 라벨을 add+remove하면 최종 제거", () => {
    const d = computeLabelDiff(["bug"], ["bug"], ["bug"]);
    expect(d.finalLabels).toEqual([]);
    expect(d.actuallyRemoved).toEqual(["bug"]);
    expect(d.actuallyAdded).toEqual([]);
  });

  it("regression: 현재 없는 라벨을 add+remove하면 final에 추가되지 않는다(remove 우세)", () => {
    // 이전 버그: not-present 라벨을 동시에 add+remove하면 actuallyAdded로 분류돼 final에
    // 잘못 추가되었다 → GitHub PUT(replaceIssueLabels)에서 "제거" 의도가 "추가"로 뒤집힘.
    const d = computeLabelDiff([], ["urgent"], ["urgent"]);
    expect(d.finalLabels).toEqual([]);
    expect(d.actuallyAdded).toEqual([]);
    expect(d.actuallyRemoved).toEqual([]);
    expect(d.noopAdd).toEqual(["urgent"]);
    expect(d.noopRemove).toEqual(["urgent"]);
  });
});
