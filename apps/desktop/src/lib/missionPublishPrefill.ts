import type { MissionBoardItem } from "./missionBoardModel";
import type { GithubPublishPanelInitial } from "../components/coding/GithubPublishPanel";

/**
 * Mission/AppBuild 결과를 GithubPublishPanel 초기값으로 변환하는 순수 함수.
 *
 * 정직성(러시아 심판 기준):
 *   - 추측은 모두 planned/draft 표식 유지 — Mission 데이터에 없는 값은 비워둔다.
 *   - branch name은 missionId를 안전 슬러그로 변환해서 W2 prefix `agent/mission-<slug>`로.
 *     (사용자가 수정 가능 — 자동 실행은 절대 일어나지 않음, prefill ≠ execute.)
 *   - PR title은 mission.title 그대로(160자 캡 안에서). PR body는 mission.goal + provenance 한 줄.
 *   - repo / file 콘텐츠는 호출자가 별도로 (App.tsx에서 워크스페이스 메타로) 채워야 한다 —
 *     MissionBoardItem 스키마에 scaffold 파일 목록이 노출되어 있지 않기 때문(W5에서 확장 가능).
 */

const SLUG_SAFE = /[^a-z0-9-]/g;

/** missionId(예: "mission_8eab...") → "8eab" 같은 짧은 slug. 안전 문자만. */
function shortSlug(missionId: string, maxLen = 12): string {
  const trimmed = missionId.replace(/^mission_?/i, "").toLowerCase();
  const safe = trimmed.replace(SLUG_SAFE, "");
  return safe.slice(0, Math.max(4, maxLen));
}

/** PR body draft — mission.goal 본문 + missionId provenance 한 줄. body가 비어 있어도 GitHub PR은 허용. */
function buildPrBody(item: MissionBoardItem): string {
  const lines: string[] = [];
  if (item.goal && item.goal.trim()) lines.push(item.goal.trim());
  // provenance — 사용자가 지워도 무방. mission lineage를 한 줄로 남긴다.
  lines.push("", `_Generated from Mission ${item.missionId} (draft — review before approving)._`);
  return lines.join("\n");
}

/**
 * 기본 prefill resolver — Mission 메타로부터 안전한 첫 초기값을 만든다.
 * 호출자(MissionBoardPanel)가 별도 resolver를 안 주면 이걸 사용한다.
 *
 *   - sourceRef는 비워두지 않고 "main"(가장 흔한 기본). 안 맞으면 사용자가 수정.
 *   - newBranchName: agent/mission-<slug>
 *   - prBase: "main"
 *   - prTitle: mission.title(160자 캡)
 *   - prBody: mission.goal + provenance
 *   - filePath / fileNewContent / sourceRef는 호출자가 override 가능
 */
export function builtinMissionPrefill(item: MissionBoardItem): GithubPublishPanelInitial {
  const slug = shortSlug(item.missionId);
  const titleCapped = item.title ? item.title.slice(0, 160) : "";
  return {
    sourceRef: "main",
    newBranchName: `agent/mission-${slug}`,
    prBase: "main",
    prTitle: titleCapped,
    prBody: buildPrBody(item),
    // filePath/fileNewContent는 의도적으로 비워둠 — Mission scaffold 노출은 W5 확장.
  };
}

/** 호출자 측 resolver 시그니처(MissionPublishEnvironment에서 사용). */
export type MissionPublishPrefillResolver = (item: MissionBoardItem) => GithubPublishPanelInitial | undefined;
