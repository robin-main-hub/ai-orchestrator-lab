import { useState } from "react";
import { Play, ExternalLink, RotateCw } from "lucide-react";
import type { MissionPreviewRunScaffoldResponse } from "@ai-orchestrator/protocol";
import { runDgxMissionPreviewScaffold } from "../runtime/stage47MissionServer";

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
  | { kind: "preview_not_running"; status: string; truthStatus: string; detail?: string; repoRoot?: string; fileCount?: number }
  | { kind: "no_scaffold"; message: string }
  | { kind: "not_configured"; message: string }
  | { kind: "materialize_failed"; message: string; repoRoot?: string }
  | { kind: "error"; message: string };

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
  const busy = result.kind === "running";
  const canRun = hasScaffoldFiles && !busy;

  const run = async () => {
    if (!canRun) return;
    setResult({ kind: "running" });
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
      setResult({
        kind: "preview_not_running",
        status: res.preview?.status ?? "unknown",
        truthStatus: res.preview?.truthStatus ?? "unknown",
        detail: res.preview?.detail,
        repoRoot: res.repoRoot,
        fileCount: res.materializedFileCount,
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
      setResult({ kind: "materialize_failed", message: res.message ?? "파일 풀기 실패", repoRoot: res.repoRoot });
      onContextEvent?.("mission.preview.run-scaffold.failed", {
        missionId,
        summary: res.message ?? "materialize_failed",
        ts: new Date().toISOString(),
      });
      return;
    }
    setResult({ kind: "error", message: res.message ?? res.outcome });
  };

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
    </div>
  );
}
