import { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";
import {
  addAnnotation,
  makeAnnotation,
  removeAnnotation,
  type PreviewAnnotation,
} from "../lib/previewAnnotations";
import { Card, CardHeader, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

/**
 * Preview Annotator — 사용자가 외부 preview에서 본 문제를 우리 카드에 정직하게 기록한다.
 *
 *   - iframe 임베드 0(X-Frame-Options / cross-origin 회피).
 *   - 자동 selector/좌표 캡처 0 — 가짜 dom 정보 X. 사용자 입력만 흐른다.
 *   - 자동 적용 0 — 이 카드는 annotations 상태만 관리. Turbo Edits prompt로 흐르는 건
 *     호출자(MissionBoardPanel)가 annotationsToTurboEditIssues로 변환해서 직접.
 *
 * shadcn Card/Badge/Button(MIT, src/components/ui/LICENSE.md) 재사용.
 */

export function PreviewAnnotatePanel({
  missionId,
  files,
  annotations,
  onChange,
  onContextEvent,
}: {
  missionId: string;
  /** scaffold 파일 — targetFile 드롭다운에 사용. undefined면 자유 입력만. */
  files: ReadonlyArray<MissionScaffoldFile> | undefined;
  annotations: ReadonlyArray<PreviewAnnotation>;
  onChange: (next: ReadonlyArray<PreviewAnnotation>) => void;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPosition, setDraftPosition] = useState("");
  const [draftFile, setDraftFile] = useState<string>("");

  const onAdd = () => {
    const description = draftDescription.trim();
    if (!description) return;
    const annotation = makeAnnotation({
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      description,
      positionHint: draftPosition.trim() || undefined,
      targetFile: draftFile.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    onChange(addAnnotation(annotations, annotation));
    onContextEvent?.("mission.preview_annotation.added", {
      missionId,
      hasPosition: !!annotation.positionHint,
      hasTargetFile: !!annotation.targetFile,
      total: annotations.length + 1,
      ts: annotation.createdAt,
    });
    setDraftDescription("");
    setDraftPosition("");
    setDraftFile("");
  };

  const onRemove = (id: string) => {
    onChange(removeAnnotation(annotations, id));
    onContextEvent?.("mission.preview_annotation.removed", {
      missionId,
      id,
      total: annotations.length - 1,
      ts: new Date().toISOString(),
    });
  };

  return (
    <Card
      className="preview-annotate"
      data-testid={`preview-annotate-${missionId}`}
      data-count={annotations.length}
    >
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <MapPin size={14} />
        <span className="font-semibold">Preview 주석</span>
        <Badge variant="secondary" data-testid={`preview-annotate-count-${missionId}`}>
          {annotations.length}개
        </Badge>
        <span className="text-muted-foreground text-xs">
          외부 preview에서 본 문제 — 위치/타깃 파일은 선택. Turbo Edits 프롬프트에 합쳐집니다.
        </span>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* 입력 폼 */}
        <div className="space-y-1">
          <input
            className="w-full rounded-md border bg-input/40 p-2 text-xs"
            placeholder="설명 (예: 헤더 글씨가 너무 작다)"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            data-testid={`preview-annotate-description-${missionId}`}
            aria-label="주석 설명"
          />
          <div className="grid grid-cols-2 gap-1">
            <input
              className="rounded-md border bg-input/40 p-2 text-xs"
              placeholder="위치 힌트 (선택)"
              value={draftPosition}
              onChange={(e) => setDraftPosition(e.target.value)}
              data-testid={`preview-annotate-position-${missionId}`}
              aria-label="위치 힌트"
            />
            {files && files.length > 0 ? (
              <select
                className="rounded-md border bg-input/40 p-2 text-xs"
                value={draftFile}
                onChange={(e) => setDraftFile(e.target.value)}
                data-testid={`preview-annotate-file-${missionId}`}
                aria-label="타깃 파일"
              >
                <option value="">(타깃 파일 선택 안 함)</option>
                {files.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="rounded-md border bg-input/40 p-2 text-xs"
                placeholder="타깃 파일 (선택)"
                value={draftFile}
                onChange={(e) => setDraftFile(e.target.value)}
                data-testid={`preview-annotate-file-${missionId}`}
                aria-label="타깃 파일"
              />
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onAdd}
            disabled={!draftDescription.trim()}
            data-testid={`preview-annotate-add-${missionId}`}
          >
            <Plus size={11} /> 주석 추가
          </Button>
        </div>

        {/* 주석 리스트 */}
        {annotations.length === 0 ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid={`preview-annotate-empty-${missionId}`}
          >
            아직 주석 없음 — preview를 열어 본 뒤 위에 기록하세요.
          </p>
        ) : (
          <ul
            className="space-y-1 text-xs"
            data-testid={`preview-annotate-list-${missionId}`}
          >
            {annotations.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-2 rounded-md border bg-muted/30 p-2"
                data-testid={`preview-annotate-item-${missionId}-${a.id}`}
              >
                <div className="flex-1 space-y-0.5">
                  <div>
                    {a.positionHint ? (
                      <Badge variant="outline" className="mr-1">
                        {a.positionHint}
                      </Badge>
                    ) : null}
                    <span>{a.description}</span>
                  </div>
                  {a.targetFile ? (
                    <div className="text-muted-foreground">
                      → <code>{a.targetFile}</code>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-red-400"
                  onClick={() => onRemove(a.id)}
                  data-testid={`preview-annotate-remove-${missionId}-${a.id}`}
                  aria-label="주석 제거"
                >
                  <Trash2 size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
