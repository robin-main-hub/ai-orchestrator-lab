import { useState } from "react";
import { Play, ExternalLink, RotateCw, Wrench } from "lucide-react";
import type { MissionPreviewRunScaffoldResponse } from "@ai-orchestrator/protocol";
import { runDgxMissionPreviewScaffold } from "../runtime/stage47MissionServer";
import {
  buildPreviewRevisionHint,
  PREVIEW_REVISION_HINT_KIND_LABEL,
  type PreviewRevisionHint,
} from "../lib/previewRevisionHint";

/**
 * Preview Run vertical 카드 — Mission Workspace 상세에서 한 번의 클릭으로
 *   scaffold/latest → tmp dir materialize → workspace attach → preview start
 * 를 묶어 실행한다.
 *
 * 정직성:
 *   - scaffold files가 없으면 CTA를 disabled로(서버 라우트도 no_scaffold 반환).
 *   - preview URL은 서버가 observed running으로 반환할 때만 링크로 노출(가짜 X).
 *   - 실패 시 outcome/message를 그대로 표시(추측 X).
 *   - 자동 실행 없음 — 사용자 명시 클릭만.
 *   - GitHub write 흐름과 분리(이 카드는 publish와 무관).
 */

type ResultState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "observed"; url: string; repoRoot: string; fileCount: number }
  | { kind: "preview_not_running"; status: string; truthStatus: string; detail?: string; repoRoot?: string; fileCount?: number; hint?: PreviewRevisionHint }
  | { kind: "no_scaffold"; message: string }
  | { kind: "not_configured"; message: string }
  | { kind: "materialize_failed"; message: string; repoRoot?: string; hint?: PreviewRevisionHint }
  | { kind: "error"; message: string; hint?: PreviewRevisionHint };

const STATUS_LABEL: Record<string, string> = {
  observed: "실행 중",
  preview_not_running: "실행 안 됨",
  no_scaffold: "scaffold 없음",
  not_configured: "서버 미설정",
  materialize_failed: "파일 풀기 실패",
  error: "오류",
};

export function PreviewRunCard({
  missionId,
  hasScaffoldFiles,
  serverBaseUrl,
  fetchImpl,
  onContextEvent,
}: {
  missionId: string;
  /** scaffold/latest에서 받은 파일이 있는지(없으면 CTA disabled). */
  hasScaffoldFiles: boolean;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [result, setResult] = useState<ResultState>({ kind: "idle" });
  /** "수정안 만들기"를 한 번 눌렀는지 표시 — 한 번 누르면 "초안 생성 예정" 상태로 잠깐 잠근다.
   *  이번 vertical에서는 자동 수정/자동 scaffold refresh를 하지 않는다(trace만 발생). */
  const [revisionRequested, setRevisionRequested] = useState(false);
  const busy = result.kind === "running";
  const canRun = hasScaffoldFiles && !busy;

  const run = async () => {
    if (!canRun) return;
    setResult({ kind: "running" });
    setRevisionRequested(false); // 새 실행 시 이전 hint 요청은 초기화.
    onContextEvent?.("mission.preview.run-scaffold.requested", {
      missionId,
      ts: new Date().toISOString(),
    });
    try {
      const res = await runDgxMissionPreviewScaffold({
        missionId,
        serverBaseUrl,
        fetchImpl,
      });
      handleResponse(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      setResult({ kind: "error", message });
      onContextEvent?.("mission.preview.run-scaffold.failed", {
        missionId,
        summary: message,
        ts: new Date().toISOString(),
      });
    }
  };

  const handleResponse = (res: MissionPreviewRunScaffoldResponse) => {
    if (res.outcome === "observed" && res.preview?.url) {
      setResult({
        kind: "observed",
        url: res.preview.url,
        repoRoot: res.repoRoot ?? "",
        fileCount: res.materializedFileCount ?? 0,
      });
      onContextEvent?.("mission.preview.run-scaffold.observed", {
        missionId,
        url: res.preview.url,
        repoRoot: res.repoRoot,
        fileCount: res.materializedFileCount,
        port: res.preview.port,
        ts: new Date().toISOString(),
      });
      return;
    }
    if (res.outcome === "preview_not_running") {
      const hint = buildPreviewRevisionHint({
        outcome: "preview_not_running",
        preview: res.preview,
        message: res.message,
      });
      setResult({
        kind: "preview_not_running",
        status: res.preview?.status ?? "unknown",
        truthStatus: res.preview?.truthStatus ?? "unknown",
        detail: res.preview?.detail,
        repoRoot: res.repoRoot,
        fileCount: res.materializedFileCount,
        hint,
      });
      onContextEvent?.("mission.preview.run-scaffold.failed", {
        missionId,
        reason: res.preview?.status,
        summary: res.preview?.detail ?? res.message,
        ts: new Date().toISOString(),
      });
      return;
    }
    if (res.outcome === "no_scaffold") {
      setResult({ kind: "no_scaffold", message: res.message ?? "scaffold/latest에 안전한 파일이 없습니다" });
      return;
    }
    if (res.outcome === "not_configured") {
      setResult({ kind: "not_configured", message: res.message ?? "서버 측 preview run-scaffold 의존성이 설정되지 않았습니다" });
      return;
    }
    if (res.outcome === "materialize_failed") {
      const hint = buildPreviewRevisionHint({ outcome: "materialize_failed", message: res.message });
      setResult({ kind: "materialize_failed", message: res.message ?? "파일 풀기 실패", repoRoot: res.repoRoot, hint });
      onContextEvent?.("mission.preview.run-scaffold.failed", {
        missionId,
        summary: res.message ?? "materialize_failed",
        ts: new Date().toISOString(),
      });
      return;
    }
    const hint = buildPreviewRevisionHint({ outcome: "error", message: res.message });
    setResult({ kind: "error", message: res.message ?? res.outcome, hint });
  };

  /** "수정안 만들기" — trace만 발생. 자동 수정/자동 scaffold refresh는 이번 vertical 범위 밖. */
  const onRequestRevision = () => {
    if (revisionRequested) return;
    const hint = "hint" in result ? result.hint : undefined;
    if (!hint) return;
    setRevisionRequested(true);
    onContextEvent?.("mission.preview.revision_hint.requested", {
      missionId,
      kind: hint.kind,
      summary: hint.summary,
      stepCount: hint.steps.length,
      ts: new Date().toISOString(),
    });
  };

  /** 현재 result에서 hint를 꺼낸다(없으면 undefined). */
  const currentHint: PreviewRevisionHint | undefined =
    result.kind === "preview_not_running" || result.kind === "materialize_failed" || result.kind === "error"
      ? result.hint
      : undefined;

  const ctaLabel = result.kind === "idle"
    ? "Preview 실행"
    : result.kind === "running"
      ? "실행 중…"
      : "다시 실행";
  const CtaIcon = result.kind === "idle" || result.kind === "running" ? Play : RotateCw;

  return (
    <div
      data-testid={`mission-preview-run-${missionId}`}
      data-state={result.kind}
      className="mission-preview-run"
    >
      <div className="mission-preview-run__row">
        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          data-testid={`mission-preview-run-cta-${missionId}`}
          className={
            canRun
              ? "mission-preview-run__cta"
              : "mission-preview-run__cta mission-preview-run__cta--disabled"
          }
          title={hasScaffoldFiles ? "scaffold 파일을 임시 디렉터리로 풀고 Vite preview를 띄웁니다" : "scaffold 파일이 없어 실행할 수 없습니다"}
        >
          <CtaIcon size={12} /> {ctaLabel}
        </button>
        {result.kind !== "idle" && result.kind !== "running" ? (
          <span
            data-testid={`mission-preview-run-status-${missionId}`}
            className={`mission-preview-run__badge mission-preview-run__badge--${result.kind}`}
          >
            {STATUS_LABEL[result.kind] ?? result.kind}
          </span>
        ) : null}
      </div>

      {result.kind === "observed" ? (
        <p className="mission-preview-run__detail mission-preview-run__detail--ok">
          {result.fileCount}개 파일 → <code>{result.repoRoot}</code>{" "}
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`mission-preview-run-link-${missionId}`}
            className="mission-preview-run__link"
          >
            {result.url} <ExternalLink size={10} />
          </a>
        </p>
      ) : null}

      {result.kind === "preview_not_running" ? (
        <p
          className="mission-preview-run__detail mission-preview-run__detail--warn"
          data-testid={`mission-preview-run-error-${missionId}`}
        >
          preview {result.status}({result.truthStatus}) — {result.detail ?? "디테일 없음"}
          {result.repoRoot ? <> · 파일은 <code>{result.repoRoot}</code>에 풀림</> : null}
        </p>
      ) : null}

      {result.kind === "no_scaffold" ? (
        <p
          className="mission-preview-run__detail mission-preview-run__detail--muted"
          data-testid={`mission-preview-run-error-${missionId}`}
        >
          {result.message}
        </p>
      ) : null}

      {result.kind === "not_configured" ? (
        <p
          className="mission-preview-run__detail mission-preview-run__detail--muted"
          data-testid={`mission-preview-run-error-${missionId}`}
        >
          {result.message}
        </p>
      ) : null}

      {result.kind === "materialize_failed" || result.kind === "error" ? (
        <p
          className="mission-preview-run__detail mission-preview-run__detail--bad"
          data-testid={`mission-preview-run-error-${missionId}`}
        >
          {result.message}
        </p>
      ) : null}

      {/* Preview revision hint — 분류 가능한 실패에서만 보임. fake observed fix 금지: 안내만. */}
      {currentHint ? (
        <div
          className="mission-preview-run__hint"
          data-testid={`mission-preview-run-hint-${missionId}`}
          data-hint-kind={currentHint.kind}
        >
          <div className="mission-preview-run__hint-head">
            <Wrench size={12} />
            <strong data-testid={`mission-preview-run-hint-kind-${missionId}`}>
              {PREVIEW_REVISION_HINT_KIND_LABEL[currentHint.kind]}
            </strong>
            <span className="mission-preview-run__hint-summary">{currentHint.summary}</span>
          </div>
          <ul className="mission-preview-run__hint-steps">
            {currentHint.steps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onRequestRevision}
            disabled={revisionRequested}
            data-testid={`mission-preview-run-hint-cta-${missionId}`}
            className={
              revisionRequested
                ? "mission-preview-run__hint-cta mission-preview-run__hint-cta--requested"
                : "mission-preview-run__hint-cta"
            }
            title={revisionRequested
              ? "수정안 초안 생성 예정(이번 vertical에서는 자동 수정/자동 scaffold refresh를 하지 않습니다)"
              : "수정 후보 초안을 만들기 위한 trace를 남깁니다. 자동 수정은 하지 않습니다."}
          >
            {revisionRequested ? "수정안 초안 생성 예정" : "수정안 만들기"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
