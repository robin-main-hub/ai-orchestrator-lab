import { useMemo, useState } from "react";
import { FileEdit, ShieldAlert } from "lucide-react";
import type { MissionBoardItem } from "../../lib/missionBoardModel";
import type { MissionScaffoldFile } from "../../lib/missionPublishPrefill";
import {
  evaluateScaffoldFile,
  SCAFFOLD_FILE_BYTE_MAX,
  type ScaffoldGateReason,
} from "../../lib/missionPublishPrefill";
import { postGithubFileChangePlan } from "../../lib/githubConnector";
import { StatusBadge } from "@/ui/status-badge";

/**
 * W5a: Multi-file plan(client-side aggregation).
 *
 * 정직성/안전(사용자 확정 W5a 컨트랙트):
 *   - 새 GitHub write route 없이 W3a single-file plan을 파일마다 호출 — 클라이언트 측 집계.
 *     서버 가드(가드: secret/binary/large/path traversal/protected branch)는 W3a 그대로 재사용.
 *   - atomic execute는 W5a 범위 밖(W5b 별도). 이 카드는 plan만.
 *   - 각 파일은 독립 plan — 한 파일 실패해도 다른 파일은 계속 plan(독립적).
 *   - 첫 버전 한도: 최대 10개 파일, 총 256 KiB(scaffold guard와 동일).
 *   - 위험 파일(binary/large/secret_suspect/.github/workflows/secrets 등)은 자동 unchecked로
 *     표시되며 사용자가 강제로 선택해도 클라이언트 측 가드가 즉시 막는다.
 *   - approval은 W3a 단일 파일 execute에서만 발급된다(plan 단계는 sha + diff만).
 *   - 자동 실행 절대 없음 — 사용자가 "선택한 N개 plan" 버튼을 명시 클릭해야만 fetch.
 *
 * 회귀 가드:
 *   - merge/review/label/assignee/branch delete UI 절대 노출 X.
 *   - .github/workflows/* 또는 secrets/env 계열 경로는 기본 차단 사유로 표시.
 */

export const MULTI_FILE_PLAN_MAX_FILES = 10;
export const MULTI_FILE_PLAN_TOTAL_BYTES_MAX = SCAFFOLD_FILE_BYTE_MAX; // 256 KiB

/** 첫 버전에서 자동 차단할 고위험 path prefix(W3a 서버 가드와 별개 — 클라이언트에서 즉시 가시화). */
const HIGH_RISK_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /^\.github\/workflows\//i,
  /^(\.)?env(\.|\/|$)/i,
  /(^|\/)secrets?(\.|\/|$)/i,
  /\.pem$/i,
  /\.key$/i,
];

function highRiskReason(path: string): string | undefined {
  for (const pattern of HIGH_RISK_PATH_PATTERNS) {
    if (pattern.test(path)) return `high-risk path(${pattern.source})`;
  }
  return undefined;
}

const REASON_LABEL: Record<ScaffoldGateReason, string> = {
  empty_path: "빈 경로",
  binary: "binary",
  too_large: "256KiB 초과",
  secret_suspect: "시크릿 의심",
};

type PerFileResult =
  | { kind: "idle" }
  | { kind: "skipped"; reason: string }
  | { kind: "planning" }
  | { kind: "planned"; planId: string; summary: string }
  | { kind: "blocked"; message: string }
  | { kind: "failed"; message: string };

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function MultiFilePlanCard({
  item,
  files,
  defaultRepoFullName,
  defaultBranchName,
  serverBaseUrl,
  fetchImpl,
  onContextEvent,
}: {
  item: MissionBoardItem;
  files: ReadonlyArray<MissionScaffoldFile>;
  defaultRepoFullName?: string;
  defaultBranchName?: string;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  // 각 파일의 가드 결과(scaffold 가드 + 클라이언트 high-risk path 가드).
  const fileEvaluations = useMemo(() => {
    return files.map((file) => {
      const scaffoldGate = evaluateScaffoldFile(file);
      const highRisk = highRiskReason(file.path);
      const safe = scaffoldGate.ok && !highRisk;
      const skipReason =
        !scaffoldGate.ok
          ? REASON_LABEL[scaffoldGate.reason]
          : highRisk ?? undefined;
      return { file, safe, skipReason };
    });
  }, [files]);

  const [repoFullName, setRepoFullName] = useState(defaultRepoFullName ?? "");
  const [branchName, setBranchName] = useState(defaultBranchName ?? "");
  // 기본 선택: 안전 파일만 자동 체크.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const evalRow of fileEvaluations) if (evalRow.safe) s.add(evalRow.file.path);
    return s;
  });
  const [results, setResults] = useState<Record<string, PerFileResult>>({});
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | undefined>();

  const selectedFiles = fileEvaluations.filter(
    (row) => row.safe && selected.has(row.file.path),
  );
  const totalBytes = selectedFiles.reduce((sum, row) => sum + utf8Bytes(row.file.newContent), 0);
  const overFileLimit = selectedFiles.length > MULTI_FILE_PLAN_MAX_FILES;
  const overByteLimit = totalBytes > MULTI_FILE_PLAN_TOTAL_BYTES_MAX;
  const canPlan =
    !busy &&
    selectedFiles.length > 0 &&
    !overFileLimit &&
    !overByteLimit &&
    !!repoFullName.trim() &&
    !!branchName.trim();

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const onPlanAll = async () => {
    if (!canPlan) return;
    setBusy(true);
    setGlobalError(undefined);
    onContextEvent?.("github.publish.multifile.plan.requested", {
      missionId: item.missionId,
      repoFullName,
      branchName,
      count: selectedFiles.length,
      totalBytes,
      ts: new Date().toISOString(),
    });
    try {
      for (const row of selectedFiles) {
        const path = row.file.path;
        setResults((prev) => ({ ...prev, [path]: { kind: "planning" } }));
        try {
          const res = await postGithubFileChangePlan(
            serverBaseUrl,
            {
              repoFullName,
              branchName,
              path,
              newContent: row.file.newContent,
            },
            fetchImpl ?? fetch,
          );
          if (res.outcome === "planned" && res.plan) {
            const summary = `${res.plan.operation} · +${res.plan.diffStat.additions} -${res.plan.diffStat.deletions}`;
            setResults((prev) => ({
              ...prev,
              [path]: { kind: "planned", planId: res.plan!.id, summary },
            }));
            onContextEvent?.("github.publish.multifile.plan.file.planned", {
              missionId: item.missionId,
              path,
              planId: res.plan.id,
              summary,
              ts: new Date().toISOString(),
            });
          } else if (res.outcome === "blocked") {
            const message = res.message ?? "blocked";
            setResults((prev) => ({ ...prev, [path]: { kind: "blocked", message } }));
            onContextEvent?.("github.publish.multifile.plan.file.blocked", {
              missionId: item.missionId,
              path,
              summary: message,
              ts: new Date().toISOString(),
            });
          } else {
            const message = res.message ?? res.outcome;
            setResults((prev) => ({ ...prev, [path]: { kind: "failed", message } }));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown";
          setResults((prev) => ({ ...prev, [path]: { kind: "failed", message } }));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  if (files.length === 0) return null;
  const safeCount = fileEvaluations.filter((r) => r.safe).length;

  return (
    <article
      className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/[0.05] p-4 text-xs text-zinc-300"
      data-testid="publish-multifile-card"
      aria-label="Multi-file plan (W5a)"
    >
      <header className="mb-2 flex items-center gap-2">
        <FileEdit className="h-4 w-4 text-cyan-300" />
        <strong className="text-[11px] font-semibold uppercase tracking-wider text-cyan-200">
          Multi-file plan(W5a) · {safeCount}/{files.length} 안전
        </strong>
        <span className="flex-1" />
        <span className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-medium uppercase text-zinc-400">
          plan only — execute는 W5b
        </span>
      </header>

      <div className="mb-2 flex flex-wrap gap-2">
        <input
          aria-label="multifile repo"
          placeholder="owner/repo"
          value={repoFullName}
          onChange={(e) => setRepoFullName(e.target.value)}
          className="w-44 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
        <input
          aria-label="multifile branch"
          placeholder="agent/feature-x"
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          className="w-44 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        />
      </div>

      <ul className="mb-2 space-y-1" data-testid="publish-multifile-list">
        {fileEvaluations.map(({ file, safe, skipReason }) => {
          const result = results[file.path] ?? { kind: "idle" };
          const checked = selected.has(file.path);
          return (
            <li
              key={file.path}
              data-testid={`publish-multifile-row-${file.path}`}
              data-safe={safe ? "true" : "false"}
              data-state={result.kind}
              className="flex items-center gap-2"
            >
              <input
                type="checkbox"
                aria-label={`include ${file.path}`}
                checked={checked && safe}
                disabled={!safe || busy}
                onChange={() => toggle(file.path)}
              />
              <span className="font-mono text-[11px]">{file.path}</span>
              <span className="text-[10px] text-zinc-500">{utf8Bytes(file.newContent)}B</span>
              {!safe ? (
                <span className="flex items-center gap-1 text-[10px] text-rose-300/80">
                  <ShieldAlert size={10} />
                  {skipReason}
                </span>
              ) : null}
              {result.kind === "planning" ? (
                <span className="ml-auto text-[10px] text-cyan-200">planning…</span>
              ) : result.kind === "planned" ? (
                <span className="ml-auto flex items-center gap-1">
                  <StatusBadge size="sm" variant="success">
                    planned
                  </StatusBadge>
                  <span className="text-[10px] text-zinc-400">{result.summary}</span>
                </span>
              ) : result.kind === "blocked" ? (
                <span className="ml-auto flex items-center gap-1">
                  <StatusBadge size="sm" variant="danger">
                    blocked
                  </StatusBadge>
                  <span className="text-[10px] text-rose-200/80">{result.message}</span>
                </span>
              ) : result.kind === "failed" ? (
                <span className="ml-auto flex items-center gap-1">
                  <StatusBadge size="sm" variant="danger">
                    failed
                  </StatusBadge>
                  <span className="text-[10px] text-rose-200/80">{result.message}</span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mb-2 text-[10.5px] text-zinc-500">
        선택 {selectedFiles.length}/{Math.min(MULTI_FILE_PLAN_MAX_FILES, safeCount)} · 합계 {totalBytes}B / {MULTI_FILE_PLAN_TOTAL_BYTES_MAX}B
      </p>
      {overFileLimit ? (
        <p className="mb-2 text-[11px] text-rose-300" data-testid="publish-multifile-error">
          최대 {MULTI_FILE_PLAN_MAX_FILES}개까지 선택 가능합니다.
        </p>
      ) : overByteLimit ? (
        <p className="mb-2 text-[11px] text-rose-300" data-testid="publish-multifile-error">
          합계 {MULTI_FILE_PLAN_TOTAL_BYTES_MAX}B(256KiB) 초과 — 선택을 줄이세요.
        </p>
      ) : null}
      {globalError ? (
        <p className="mb-2 text-[11px] text-rose-300" data-testid="publish-multifile-error">
          {globalError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canPlan}
        onClick={onPlanAll}
        data-testid="publish-multifile-plan-all"
        className={
          canPlan
            ? "rounded border border-emerald-300/40 px-2 py-1 text-[11px] font-medium uppercase text-emerald-200 hover:bg-emerald-300/10"
            : "rounded border border-white/10 px-2 py-1 text-[11px] font-medium uppercase text-zinc-500 cursor-not-allowed"
        }
      >
        {busy ? "Plan 진행 중…" : `선택한 ${selectedFiles.length}개 plan`}
      </button>
    </article>
  );
}
