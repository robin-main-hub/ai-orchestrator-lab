import { createHash } from "node:crypto";
import { isRepoAllowed, scanForSecrets } from "./githubCommentWriteGuards.js";

/**
 * W5d-Phase-1 — GitHub PR labels add/remove 게이트(순수).
 *
 * 좁은 범위:
 *   - labels add/remove만(assignees는 Phase 2).
 *   - 각각 최대 20개, 이름 50자 이내, 제어문자 없음.
 *   - label 이름 secret 패턴(W1 scanner) 차단 — 외부 노출 표면.
 *   - 게이트는 입력만으로 결정 — TOCTOU/PR 존재는 호출자가 GitHub로 확인한다.
 *
 * 절대 받지 않음(스키마 자체에 없음): milestone, project, draft, state, base, assignees(Phase 2).
 */

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const PR_LABEL_NAME_MAX_CHARS = 50;
export const PR_LABELS_MAX_CHANGE = 20;

export type PrLabelsUpdateGate =
  | {
      kind: "ok";
      repoFullName: string;
      pullNumber: number;
      addLabels: string[];
      removeLabels: string[];
    }
  | { kind: "blocked"; reason: PrLabelsUpdateBlockReason; message: string };

export type PrLabelsUpdateBlockReason =
  | "allowlist"
  | "labels_too_many"
  | "label_too_long"
  | "secret_suspect"
  | "empty_change";

function block(reason: PrLabelsUpdateBlockReason, message: string): PrLabelsUpdateGate {
  return { kind: "blocked", reason, message };
}

/** 정렬된 라벨 이름들의 sha256 — TOCTOU 검사 키. */
export function hashLabelSet(labels: ReadonlyArray<string>): string {
  const sorted = [...labels].sort();
  return createHash("sha256").update(sorted.join("\0"), "utf8").digest("hex");
}

export function evaluatePrLabelsUpdateGate(input: {
  repoFullName: string;
  pullNumber: number;
  addLabels: ReadonlyArray<string>;
  removeLabels: ReadonlyArray<string>;
  allowlist: ReadonlyArray<string>;
  tokenPresent: boolean;
}): PrLabelsUpdateGate {
  if (!input.tokenPresent) {
    return block("allowlist", "GITHUB_TOKEN이 없어 write가 비활성화되어 있습니다");
  }
  if (input.allowlist.length === 0) {
    return block("allowlist", "GITHUB_WRITE_REPO_ALLOWLIST가 비어 있어 write가 비활성화되어 있습니다");
  }
  if (!REPO_PATTERN.test(input.repoFullName) || !isRepoAllowed(input.repoFullName, input.allowlist)) {
    return block("allowlist", `${input.repoFullName}은(는) write 허용 목록에 없습니다`);
  }
  if (input.addLabels.length === 0 && input.removeLabels.length === 0) {
    return block("empty_change", "add/remove 둘 다 비어 있습니다 — 변경 의도가 없습니다");
  }
  if (input.addLabels.length > PR_LABELS_MAX_CHANGE || input.removeLabels.length > PR_LABELS_MAX_CHANGE) {
    return block("labels_too_many", `한 번에 최대 ${PR_LABELS_MAX_CHANGE}개까지 add/remove 가능합니다`);
  }
  const allNames = [...input.addLabels, ...input.removeLabels];
  for (const name of allNames) {
    const trimmed = name.trim();
    if (!trimmed) {
      return block("label_too_long", "빈 라벨 이름은 허용되지 않습니다");
    }
    if (trimmed.length > PR_LABEL_NAME_MAX_CHARS) {
      return block("label_too_long", `라벨 이름이 너무 깁니다(${PR_LABEL_NAME_MAX_CHARS}자 이내): '${trimmed.slice(0, 20)}…'`);
    }
    // 라벨 이름은 외부 표면에 보이므로 secret 패턴 차단(드물지만 봇이 잘못 잡아낼 수 있음).
    const scan = scanForSecrets(trimmed);
    if (!scan.ok) {
      return block("secret_suspect", `라벨 이름에서 비밀 패턴 감지(${scan.matched})`);
    }
  }
  // 정규화 + 중복 제거.
  const addNorm = Array.from(new Set(input.addLabels.map((s) => s.trim())));
  const removeNorm = Array.from(new Set(input.removeLabels.map((s) => s.trim())));
  return {
    kind: "ok",
    repoFullName: input.repoFullName,
    pullNumber: input.pullNumber,
    addLabels: addNorm,
    removeLabels: removeNorm,
  };
}

/** 현재 labels + add/remove에서 final desired set과 changeSummary 도출. */
export function computeLabelDiff(
  currentLabels: ReadonlyArray<string>,
  addLabels: ReadonlyArray<string>,
  removeLabels: ReadonlyArray<string>,
): {
  finalLabels: string[];
  actuallyAdded: string[];
  actuallyRemoved: string[];
  noopAdd: string[];
  noopRemove: string[];
} {
  const currentSet = new Set(currentLabels);
  const addSet = new Set(addLabels);
  const removeSet = new Set(removeLabels);
  // 우선순위: remove가 add보다 우세하다. 같은 이름을 add+remove하면(드물지만) add는 무효(noop)로
  // 본다 — 라벨이 현재 없을 때도 마찬가지. 이전에는 not-present + add&remove인 이름이 final에
  // 잘못 추가되어, "제거" 의도가 외부(GitHub PUT)에 "추가"로 뒤집히는 버그가 있었다.
  const actuallyAdded: string[] = [];
  const noopAdd: string[] = [];
  for (const name of addSet) {
    if (currentSet.has(name) || removeSet.has(name)) noopAdd.push(name);
    else actuallyAdded.push(name);
  }
  const actuallyRemoved: string[] = [];
  const noopRemove: string[] = [];
  for (const name of removeSet) {
    if (currentSet.has(name)) actuallyRemoved.push(name);
    else noopRemove.push(name);
  }
  const final = new Set<string>(currentLabels);
  for (const name of actuallyRemoved) final.delete(name);
  for (const name of actuallyAdded) final.add(name);
  return {
    finalLabels: [...final].sort(),
    actuallyAdded: actuallyAdded.sort(),
    actuallyRemoved: actuallyRemoved.sort(),
    noopAdd: noopAdd.sort(),
    noopRemove: noopRemove.sort(),
  };
}
