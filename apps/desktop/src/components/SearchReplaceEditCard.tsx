import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FilePlus2,
  FileWarning,
  PencilLine,
  ShieldAlert,
  XCircle,
  Wand2,
} from "lucide-react";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";
import type { MissionScaffoldOverlayResponse } from "@ai-orchestrator/protocol";
import {
  buildSearchReplaceOverlayPlan,
  type BlockOutcome,
  type SearchReplaceOverlayPlan,
} from "../lib/searchReplaceOverlay";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

/**
 * Search/Replace Edit — Aider 스타일 텍스트로 큰 코드베이스도 좁고 정확하게 편집.
 *
 *   - 좁은 패치: 전체 파일 재생성 대신 SEARCH/REPLACE 페어로 변경 지점만.
 *   - 4단계 매칭(exact → whitespace → indentation → fuzzy 0.85+).
 *   - 결정적 — LLM 호출 0, 추측 0.
 *   - 자동 실행 0: 미리보기 → 사용자가 "적용" 누른 경우에만 scaffold/overlay POST.
 *   - 가드 통과 + 한 블록 이상 적용된 파일만 overlay에 들어감.
 *
 * shadcn Card/Badge/Button(src/components/ui/, MIT) 재사용.
 */

const PLACEHOLDER = `src/example.ts
<<<<<<< SEARCH
const foo = "old";
=======
const foo = "new";
>>>>>>> REPLACE`;

export function SearchReplaceEditCard({
  missionId,
  files,
  onApply,
  onContextEvent,
}: {
  missionId: string;
  /** 현재 scaffold 파일. undefined면 카드는 disabled 상태. */
  files: ReadonlyArray<MissionScaffoldFile> | undefined;
  /** Apply 클릭 시 호출자(MissionBoardPanel)가 scaffold/overlay POST를 책임진다.
   *  자동 실행 0 — 이 컴포넌트는 결과만 던지고 끝. */
  onApply: (overlayFiles: ReadonlyArray<{ path: string; content: string }>) => Promise<
    MissionScaffoldOverlayResponse | void
  >;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<
    | { kind: "applied"; recorded: number }
    | { kind: "blocked"; message?: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const plan: SearchReplaceOverlayPlan | null = useMemo(() => {
    if (!files) return null;
    if (!text.trim()) return null;
    return buildSearchReplaceOverlayPlan(files, text);
  }, [files, text]);

  const canApply = !!plan && plan.overlayFiles.length > 0 && !submitting;

  const onClickApply = async () => {
    if (!plan || plan.overlayFiles.length === 0) return;
    setSubmitting(true);
    setLastOutcome(null);
    onContextEvent?.("mission.search_replace.apply_clicked", {
      missionId,
      fileCount: plan.overlayFiles.length,
      blockApplied: plan.blocks.filter((b) => b.kind === "applied" || b.kind === "created").length,
      blockFailed: plan.blocks.filter((b) => b.kind === "failed").length,
      blockError: plan.blocks.filter((b) => b.kind === "error").length,
      skippedByGate: plan.skippedByGate.length,
      ts: new Date().toISOString(),
    });
    try {
      const res = await onApply(plan.overlayFiles);
      if (res && res.outcome === "recorded") {
        setLastOutcome({ kind: "applied", recorded: plan.overlayFiles.length });
      } else if (res && res.outcome === "blocked") {
        setLastOutcome({ kind: "blocked", message: res.message });
      } else {
        // void or unexpected outcome — 최소 응답으로 처리
        setLastOutcome({ kind: "applied", recorded: plan.overlayFiles.length });
      }
    } catch (e) {
      setLastOutcome({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !files;

  return (
    <Card
      className="search-replace-edit"
      data-testid={`search-replace-edit-${missionId}`}
      data-state={disabled ? "disabled" : plan ? "preview" : "idle"}
    >
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <Wand2 size={14} />
        <span className="font-semibold">Search/Replace 편집</span>
        <span className="text-muted-foreground text-xs">
          Aider 스타일 블록을 붙여넣고 좁게 적용
        </span>
      </CardHeader>

      <CardContent className="space-y-2">
        <textarea
          className="search-replace-edit__textarea w-full min-h-[140px] rounded-md border bg-input/40 p-2 font-mono text-xs"
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          data-testid={`search-replace-edit-textarea-${missionId}`}
          aria-label="Search/Replace 편집 텍스트"
        />

        {disabled ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid={`search-replace-edit-disabled-${missionId}`}
          >
            스캐폴드 없음 — preview 실행 또는 scaffold refresh가 먼저 필요합니다.
          </p>
        ) : plan ? (
          <PlanPreview missionId={missionId} plan={plan} />
        ) : (
          <p className="text-muted-foreground text-xs">
            블록을 붙여넣으면 적용 미리보기가 나타납니다.
          </p>
        )}
      </CardContent>

      <CardFooter className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          onClick={onClickApply}
          disabled={!canApply}
          data-testid={`search-replace-edit-apply-${missionId}`}
        >
          {submitting ? "적용 중..." : `Apply ${plan?.overlayFiles.length ?? 0} 파일`}
        </Button>
        {lastOutcome?.kind === "applied" ? (
          <span
            className="text-xs text-emerald-400"
            data-testid={`search-replace-edit-applied-${missionId}`}
          >
            <CheckCircle2 size={11} /> overlay에 {lastOutcome.recorded}개 기록됨 — preview/QA 재실행 가능
          </span>
        ) : null}
        {lastOutcome?.kind === "blocked" ? (
          <span
            className="text-xs text-amber-400"
            data-testid={`search-replace-edit-blocked-${missionId}`}
          >
            blocked: {lastOutcome.message ?? "이유 없음"}
          </span>
        ) : null}
        {lastOutcome?.kind === "error" ? (
          <span
            className="text-xs text-red-400"
            data-testid={`search-replace-edit-error-${missionId}`}
          >
            오류: {lastOutcome.message}
          </span>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function PlanPreview({
  missionId,
  plan,
}: {
  missionId: string;
  plan: SearchReplaceOverlayPlan;
}) {
  const applied = plan.blocks.filter((b) => b.kind === "applied").length;
  const created = plan.blocks.filter((b) => b.kind === "created").length;
  const failed = plan.blocks.filter((b) => b.kind === "failed").length;
  const errors = plan.blocks.filter((b) => b.kind === "error").length;
  return (
    <div
      className="search-replace-edit__preview space-y-2"
      data-testid={`search-replace-edit-preview-${missionId}`}
    >
      <div className="flex items-center gap-1 flex-wrap text-xs">
        <Badge variant="default" data-testid={`search-replace-edit-stats-applied-${missionId}`}>
          <PencilLine size={10} /> 적용 {applied}
        </Badge>
        {created > 0 ? (
          <Badge variant="secondary" data-testid={`search-replace-edit-stats-created-${missionId}`}>
            <FilePlus2 size={10} /> 신규 {created}
          </Badge>
        ) : null}
        {failed > 0 ? (
          <Badge
            variant="destructive"
            data-testid={`search-replace-edit-stats-failed-${missionId}`}
          >
            <XCircle size={10} /> 실패 {failed}
          </Badge>
        ) : null}
        {errors > 0 ? (
          <Badge variant="destructive" data-testid={`search-replace-edit-stats-error-${missionId}`}>
            <FileWarning size={10} /> 오류 {errors}
          </Badge>
        ) : null}
        {plan.skippedByGate.length > 0 ? (
          <Badge
            variant="destructive"
            data-testid={`search-replace-edit-stats-gate-${missionId}`}
          >
            <ShieldAlert size={10} /> 가드 차단 {plan.skippedByGate.length}
          </Badge>
        ) : null}
      </div>

      {plan.blocks.length > 0 ? (
        <ul className="space-y-1 text-xs" data-testid={`search-replace-edit-block-list-${missionId}`}>
          {plan.blocks.map((b, idx) => (
            <li key={idx} className="font-mono">
              <BlockSummary missionId={missionId} idx={idx} outcome={b} />
            </li>
          ))}
        </ul>
      ) : null}

      {plan.skippedByGate.length > 0 ? (
        <p className="text-xs text-amber-400">
          가드 차단:{" "}
          {plan.skippedByGate
            .map((s) => `${s.path}(${s.reason})`)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function BlockSummary({
  missionId,
  idx,
  outcome,
}: {
  missionId: string;
  idx: number;
  outcome: BlockOutcome;
}) {
  if (outcome.kind === "applied") {
    return (
      <span data-testid={`search-replace-edit-block-${missionId}-${idx}`} data-result="applied">
        <CheckCircle2 size={10} className="inline" /> {outcome.filepath}{" "}
        <span className="text-muted-foreground">[{outcome.result.strategy}]</span>
      </span>
    );
  }
  if (outcome.kind === "created") {
    return (
      <span data-testid={`search-replace-edit-block-${missionId}-${idx}`} data-result="created">
        <FilePlus2 size={10} className="inline" /> {outcome.filepath}{" "}
        <span className="text-muted-foreground">[신규]</span>
      </span>
    );
  }
  if (outcome.kind === "failed") {
    return (
      <span data-testid={`search-replace-edit-block-${missionId}-${idx}`} data-result="failed">
        <XCircle size={10} className="inline" /> {outcome.filepath}{" "}
        <span className="text-muted-foreground">{outcome.result.reason ?? "매칭 실패"}</span>
      </span>
    );
  }
  // error
  return (
    <span data-testid={`search-replace-edit-block-${missionId}-${idx}`} data-result="error">
      <FileWarning size={10} className="inline" />{" "}
      {outcome.raw.filepath ?? "(파일 라벨 없음)"}{" "}
      <span className="text-muted-foreground">[{outcome.reason}]</span>
    </span>
  );
}
