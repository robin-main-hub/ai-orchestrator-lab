import type { TurboEditPromptIssue } from "./turboEditPrompt";

/**
 * OSS-H7 — Preview Annotator.
 *
 * Preview는 외부 링크에서 열리므로 우리 UI에 iframe을 박지 않는다(X-Frame-Options /
 * cross-origin 회피). 대신 사용자가 본 것을 정직하게 텍스트로 기록하고, 그 주석을
 * Turbo Edits 프롬프트의 extraIssues로 흘려보낸다.
 *
 * 정직성:
 *   - 자동 좌표 캡처 0 — 가짜 selector / 가짜 dom 정보 X.
 *   - 사용자가 직접 입력한 description/positionHint/targetFile만 흐른다.
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
      // 좌표는 prefix에 합쳐 prompt에서 한 줄로 보이게. positionHint와 둘 다 있으면 같이.
      const tagParts: string[] = [];
      if (a.positionHint) tagParts.push(a.positionHint);
      if (a.coords) tagParts.push(`좌표 ${a.coords.xPct}% / ${a.coords.yPct}%`);
      const summary = tagParts.length > 0 ? `[${tagParts.join(" · ")}] ${a.description}` : a.description;
      const recommendation = a.targetFile
        ? `${a.targetFile} 근처를 살펴 사용자가 짚은 문제를 좁게 고치세요. 정확한 위치 모르면 블록 만들지 마세요.`
        : `사용자가 짚은 문제를 정확한 위치를 모를 때는 블록 만들지 마세요.`;
      return {
        id: `pa_${a.id}`,
        kind: "preview_annotation",
        severity: "medium" as const,
        summary,
        recommendation,
      };
    });
}
