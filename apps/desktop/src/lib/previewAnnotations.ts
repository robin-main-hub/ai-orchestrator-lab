import type { TurboEditPromptIssue } from "./turboEditPrompt";

/**
 * OSS-H7 — Preview Annotator.
 *
 * Preview에서 사용자가 본 것을 정직하게 기록하고, 그 주석을 Turbo Edits
 * 프롬프트의 extraIssues로 흘려보낸다.
 *
 * 정직성:
 *   - ChatSidePanel iframe 위 클릭은 viewport 좌표/URL만 캡처한다.
 *   - iframe 내부 DOM selector/text는 cross-origin 경계 때문에 unknown으로 둔다.
 *   - 텍스트 annotator는 사용자가 직접 입력한 description/positionHint/targetFile만 흐른다.
 *   - 자동 적용 0 — 이 모듈은 표현만 만들고 적용/생성은 호출자가.
 */

export type PreviewAnnotationCoords = {
  /** iframe 폭 기준 0~100 — bounding rect 비율. cross-origin 안전(오버레이 클릭에서만 추출). */
  xPct: number;
  yPct: number;
};

export type PreviewAnnotation = {
  id: string;
  /** 사용자가 본 것에 대한 한 줄 설명. 필수. */
  description: string;
  /** 어디에 있었는지(헤더 / 오른쪽 상단 등). 선택. */
  positionHint?: string;
  /** 어떤 파일이라고 생각하는지 — scaffold 파일 path 중 선택(또는 자유). */
  targetFile?: string;
  /** iframe 좌표(있을 때만) — H7 PreviewIframe overlay 클릭에서 채워짐. */
  coords?: PreviewAnnotationCoords;
  /** ISO timestamp — 정렬/표시용. */
  createdAt: string;
  /** iframe viewport 클릭에서 온 좌표-only annotation. DOM selector/text는 cross-origin 경계 때문에 unknown. */
  viewportClick?: PreviewViewportClick;
};

export type PreviewViewportClick = {
  url: string;
  /** iframe viewport 기준 px 좌표. */
  x: number;
  y: number;
  /** iframe viewport 기준 percent 좌표(0-100). */
  percentX: number;
  percentY: number;
  viewportWidth: number;
  viewportHeight: number;
  capturedAt: string;
};

export type PreviewAnnotationDraft = {
  missionId: string;
  annotation: PreviewAnnotation;
  sentAt: string;
};

function clampPct(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

export function makeAnnotation(input: {
  id: string;
  description: string;
  positionHint?: string;
  targetFile?: string;
  coords?: PreviewAnnotationCoords;
  createdAt: string;
}): PreviewAnnotation {
  return {
    id: input.id,
    description: input.description.trim(),
    positionHint: input.positionHint?.trim() || undefined,
    targetFile: input.targetFile?.trim() || undefined,
    coords: input.coords
      ? { xPct: clampPct(input.coords.xPct), yPct: clampPct(input.coords.yPct) }
      : undefined,
    createdAt: input.createdAt,
  };
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatPreviewViewportClickForPrompt(click: PreviewViewportClick): string {
  return `User clicked preview at ${formatPercent(click.percentX)}% x, ${formatPercent(click.percentY)}% y on ${click.url}`;
}

export function makePreviewViewportAnnotation(input: {
  id: string;
  click: PreviewViewportClick;
}): PreviewAnnotation {
  return {
    id: input.id,
    description: formatPreviewViewportClickForPrompt(input.click),
    positionHint: `${formatPercent(input.click.percentX)}% x, ${formatPercent(input.click.percentY)}% y`,
    createdAt: input.click.capturedAt,
    viewportClick: input.click,
  };
}

export function addAnnotation(
  list: ReadonlyArray<PreviewAnnotation>,
  annotation: PreviewAnnotation,
): ReadonlyArray<PreviewAnnotation> {
  // 같은 id가 들어오면 교체(중복 보존 안 함).
  const next = list.filter((a) => a.id !== annotation.id);
  next.push(annotation);
  return next;
}

export function removeAnnotation(
  list: ReadonlyArray<PreviewAnnotation>,
  id: string,
): ReadonlyArray<PreviewAnnotation> {
  return list.filter((a) => a.id !== id);
}

/**
 * 주석을 TurboEditPromptIssue 모양으로 변환한다.
 *   kind = "preview_annotation"
 *   summary = "[positionHint] description" (positionHint 있을 때만 prefix)
 *   recommendation = targetFile가 있으면 "{file} 근처를 살펴 …" / 없으면 "정확한 위치 모르면 블록 만들지 마라"
 * 추측 0 — 모든 필드는 사용자가 직접 입력했거나 비어 있다.
 */
export function annotationsToTurboEditIssues(
  list: ReadonlyArray<PreviewAnnotation>,
): ReadonlyArray<TurboEditPromptIssue> {
  return list
    .filter((a) => a.description.length > 0)
    .map((a) => {
      // H7 정직성: viewportClick(cross-origin 안전, DOM selector unknown) 우선.
      // coords(main's viewport-only)도 보존 — 둘 다 cross-origin 안전.
      let summary: string;
      let recommendation: string;
      if (a.viewportClick) {
        summary = formatPreviewViewportClickForPrompt(a.viewportClick);
        recommendation = `DOM selector unknown due to iframe boundary. Use only the preview URL and viewport coordinates (${formatPercent(a.viewportClick.percentX)}% x, ${formatPercent(a.viewportClick.percentY)}% y; ${a.viewportClick.x}px/${a.viewportClick.y}px in ${a.viewportClick.viewportWidth}x${a.viewportClick.viewportHeight}). Do not invent selector or text; if you cannot confidently locate the source, omit the block.`;
      } else {
        const tagParts: string[] = [];
        if (a.positionHint) tagParts.push(a.positionHint);
        if (a.coords) tagParts.push(`좌표 ${a.coords.xPct}% / ${a.coords.yPct}%`);
        summary = tagParts.length > 0 ? `[${tagParts.join(" · ")}] ${a.description}` : a.description;
        recommendation = a.targetFile
          ? `${a.targetFile} 근처를 살펴 사용자가 짚은 문제를 좁게 고치세요. 정확한 위치 모르면 블록 만들지 마세요.`
          : `사용자가 짚은 문제를 정확한 위치를 모를 때는 블록 만들지 마세요.`;
      }
      return {
        id: `pa_${a.id}`,
        kind: "preview_annotation",
        severity: "medium" as const,
        summary,
        recommendation,
      };
    });
}
