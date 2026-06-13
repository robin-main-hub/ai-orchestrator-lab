import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge, Github, MessageSquarePlus, Plus, RefreshCw, X } from "lucide-react";
import type {
  GithubCommentWritePlan,
  GithubContextAttachment,
  GithubPullRequestDetail,
  GithubPullRequestSummary,
} from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import {
  fetchGithubConnectorStatus,
  fetchGithubPullRequest,
  fetchGithubPullRequests,
  githubConnectorChipLabel,
  githubOutcomeLabel,
  postGithubCommentExecute,
  postGithubCommentPlan,
  sha256Hex,
  type GithubConnectorView,
  type GithubResourceResult,
} from "../../lib/githubConnector";
import { isContextAttached, prContextKey } from "../../lib/githubContext";
import {
  GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY,
  GITHUB_COMMENT_AUTOEXECUTE_WARNING,
  createArmedState,
  isArmed,
  parseArmedState,
  type AutoExecuteArmedState,
} from "../../lib/githubCommentAutoExecute";

/**
 * D1 — GitHub read-only PR 표면. 코딩 워크벤치에서 PR 목록/상세를 "읽기 전용"으로 본다.
 *
 * 정직성(러시아 심판 기준):
 *  - 토큰 미설정이면 GitHub를 호출하지 않고 "미설정"만 표시한다.
 *  - 실제 200 응답만 "관측됨"(TruthStatus observed)으로 라벨한다. 권한 부족(401·403)·
 *    연결 실패(network)·GitHub 오류는 빈 목록이 아니라 각각의 사유로 구분해 보여준다.
 *  - 토큰은 서버 env에만 — 여기로 오지 않는다. 쓰기 컨트롤은 존재하지 않는다.
 *  - 결과를 모델 컨텍스트에 자동 주입하지 않는다(그건 D2).
 */

function parseRepo(input: string): { owner: string; repo: string } | undefined {
  const match = /^\s*([\w.-]+)\s*\/\s*([\w.-]+)\s*$/.exec(input);
  if (!match) return undefined;
  return { owner: match[1]!, repo: match[2]! };
}

function ConnectorBadge({ view }: { view: GithubConnectorView }) {
  const label = githubConnectorChipLabel(view);
  const variant = label.tone === "configured" ? "success" : label.tone === "error" ? "danger" : "muted";
  return (
    <span title={label.title}>
      <StatusBadge size="sm" variant={variant}>
        {label.text.replace(/^GitHub[: ]*/, "")}
      </StatusBadge>
    </span>
  );
}

export function GithubPullRequestPanel({
  serverBaseUrl,
  defaultRepo = "",
  attachedContext,
  onAttach,
  onDetach,
  onContextEvent,
}: {
  serverBaseUrl?: string | string[];
  defaultRepo?: string;
  /** GitHub context already attached to the active coding session (D2) */
  attachedContext?: GithubContextAttachment[];
  /** attach the selected PR — the workbench re-reads it server-side to confirm observed */
  onAttach?: (owner: string, repo: string, pullNumber: number) => void;
  onDetach?: (id: string) => void;
  /** redacted trace emit for W1b — wired by CodingWorkbench to EventStorage */
  onContextEvent?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [connector, setConnector] = useState<GithubConnectorView>({ state: "unknown" });
  const [repoInput, setRepoInput] = useState(defaultRepo);
  const [listResult, setListResult] = useState<GithubResourceResult<GithubPullRequestSummary[]> | null>(null);
  const [detail, setDetail] = useState<GithubResourceResult<GithubPullRequestDetail> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const configured = connector.state === "ready" && connector.status.configured;

  useEffect(() => {
    let cancelled = false;
    void fetchGithubConnectorStatus(serverBaseUrl).then((next) => {
      if (!cancelled) setConnector(next);
    });
    return () => {
      cancelled = true;
    };
  }, [serverBaseUrl]);

  const loadPulls = useCallback(async () => {
    const repo = parseRepo(repoInput);
    if (!repo || !configured) return; // 미설정/형식오류면 GitHub를 호출하지 않는다
    setLoading(true);
    setDetail(null);
    setSelected(null);
    const result = await fetchGithubPullRequests(serverBaseUrl, repo.owner, repo.repo);
    setListResult(result);
    setLoading(false);
  }, [repoInput, configured, serverBaseUrl]);

  const openDetail = useCallback(
    async (pullNumber: number) => {
      const repo = parseRepo(repoInput);
      if (!repo || !configured) return;
      setSelected(pullNumber);
      setDetail(null);
      const result = await fetchGithubPullRequest(serverBaseUrl, repo.owner, repo.repo, pullNumber);
      setDetail(result);
    },
    [repoInput, configured, serverBaseUrl],
  );

  const repoValid = Boolean(parseRepo(repoInput));

  // ── W1b: comment write composer state + auto-execute armed guard ──────────
  const [commentBody, setCommentBody] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<GithubCommentWritePlan | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [executedHtmlUrl, setExecutedHtmlUrl] = useState<string | null>(null);
  const [armed, setArmed] = useState<AutoExecuteArmedState | null>(() => {
    try {
      return parseArmedState(window.localStorage.getItem(GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY), new Date().toISOString());
    } catch {
      return null;
    }
  });
  const [armDialogOpen, setArmDialogOpen] = useState(false);

  // armed 상태가 바뀌면 localStorage 동기화. 해제(null)면 키 제거.
  useEffect(() => {
    try {
      if (armed) window.localStorage.setItem(GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY, JSON.stringify(armed));
      else window.localStorage.removeItem(GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY);
    } catch {
      // storage 불가 환경 — 세션 내 유지
    }
  }, [armed]);

  // 탭이 열려 있어도 TTL이 지나면 자동 해제 — 잊고 켜둔 상태가 외부 게시로 이어지지 않게.
  useEffect(() => {
    if (!armed) return;
    const remainingMs = Date.parse(armed.expiresAt) - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      setArmed(null);
      return;
    }
    const timer = window.setTimeout(() => setArmed(null), remainingMs);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const confirmArm = () => {
    const now = new Date().toISOString();
    const state = createArmedState(now);
    setArmed(state);
    setArmDialogOpen(false);
    onContextEvent?.("github.comment.write.auto_execute_armed", { armedAt: state.armedAt, expiresAt: state.expiresAt });
  };

  const disarm = () => {
    setArmed(null);
    setComposerNotice("자동게시 해제됨");
  };

  const planComment = async () => {
    const repo = parseRepo(repoInput);
    const pr = detail?.outcome === "observed" ? detail.data : undefined;
    if (!repo || !pr || !commentBody.trim()) return;
    setComposerBusy(true);
    setExecutedHtmlUrl(null);
    setComposerNotice(null);
    try {
      const resp = await postGithubCommentPlan(serverBaseUrl, {
        action: "comment_create",
        repoFullName: `${repo.owner}/${repo.repo}`,
        number: pr.number,
        targetKind: "pull_request",
        body: commentBody,
      });
      if (resp.outcome === "planned" && resp.plan) {
        setCurrentPlan(resp.plan);
        setComposerNotice(`초안 생성 — 승인 또는 자동게시 대기 (plan ${resp.plan.id})`);
        onContextEvent?.("github.comment.write.planned", {
          planId: resp.plan.id,
          repoFullName: resp.plan.repoFullName,
          number: resp.plan.number,
          bodySha256: resp.plan.bodySha256,
          bodyLength: resp.plan.bodyLength,
          status: resp.plan.status,
        });
      } else {
        setCurrentPlan(null);
        setComposerNotice(`초안 만들기 실패: ${resp.message ?? resp.outcome}`);
        onContextEvent?.("github.comment.write.failed", { stage: "plan", outcome: resp.outcome, message: resp.message ?? "" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setComposerNotice(`초안 만들기 실패: ${message}`);
      // trace는 redacted — 원본 fetch/네트워크 에러 본문은 trace에 싣지 않는다(토큰·헤더·내부 URL 포함 가능).
      onContextEvent?.("github.comment.write.failed", {
        stage: "plan",
        outcome: "connection_failed",
        errorKind: error instanceof Error ? error.name : "unknown",
        messageLength: message.length,
      });
    } finally {
      setComposerBusy(false);
    }
  };

  const executeComment = async () => {
    if (!currentPlan || !armed) return;
    // 제출 직전 armed freshness 재검증 — 탭이 오래 열려 있어 만료됐다면 즉시 해제 후 거절.
    const stillArmed = parseArmedState(JSON.stringify(armed), new Date().toISOString());
    if (!stillArmed) {
      setArmed(null);
      setComposerNotice("자동게시 TTL 만료 — 다시 켜야 합니다");
      return;
    }
    setComposerBusy(true);
    setComposerNotice(null);
    try {
      const resp = await postGithubCommentExecute(serverBaseUrl, {
        planId: currentPlan.id,
        bodySha256: currentPlan.bodySha256,
        autoExecuteArmed: true,
        armedAt: armed.armedAt,
      });
      if (resp.outcome === "observed" && resp.htmlUrl) {
        setExecutedHtmlUrl(resp.htmlUrl);
        setComposerNotice(`게시 완료(관측 ${resp.observedAt ?? ""})`);
        onContextEvent?.("github.comment.write.created", {
          planId: resp.planId,
          commentId: resp.commentId,
          htmlUrl: resp.htmlUrl,
          observedAt: resp.observedAt,
        });
      } else {
        setComposerNotice(`게시 실패: ${resp.message ?? resp.outcome}`);
        onContextEvent?.("github.comment.write.failed", { stage: "execute", outcome: resp.outcome, message: resp.message ?? "", planId: currentPlan.id });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setComposerNotice(`게시 실패: ${message}`);
      // trace는 redacted — 클라이언트 네트워크 예외의 원본 메시지는 토큰/헤더를 포함할 수 있어 trace에 미포함.
      onContextEvent?.("github.comment.write.failed", {
        stage: "execute",
        outcome: "connection_failed",
        errorKind: error instanceof Error ? error.name : "unknown",
        messageLength: message.length,
        planId: currentPlan.id,
      });
    } finally {
      setComposerBusy(false);
    }
  };

  return (
    <section className="coding-github-pr-panel" aria-label="GitHub PR 읽기 전용">
      <header className="coding-github-pr__header">
        <Github size={13} aria-hidden />
        <span>GitHub PR (읽기 전용)</span>
        <ConnectorBadge view={connector} />
      </header>

      {!configured ? (
        <p className="coding-github-pr-empty">
          {connector.state === "ready"
            ? connector.status.note
            : connector.state === "error"
              ? `상태 확인 실패: ${connector.message}`
              : "서버 상태 확인 중…"}
        </p>
      ) : (
        <>
          <div className="coding-github-pr__controls">
            <input
              className="coding-github-pr__repo"
              placeholder="owner/repo"
              value={repoInput}
              onChange={(event) => setRepoInput(event.target.value)}
              aria-label="저장소 (owner/repo)"
            />
            <button
              type="button"
              className="coding-github-pr__load"
              onClick={() => void loadPulls()}
              disabled={!repoValid || loading}
              title={repoValid ? "PR 목록 불러오기 (읽기 전용)" : "owner/repo 형식으로 입력하세요"}
            >
              <RefreshCw size={12} aria-hidden />
              {loading ? "불러오는 중…" : "PR 불러오기"}
            </button>
          </div>

          {attachedContext && attachedContext.length > 0 ? (
            <div className="coding-github-pr-attached" aria-label="첨부된 GitHub 컨텍스트">
              <span className="coding-github-pr__msg">첨부된 컨텍스트 {attachedContext.length}</span>
              {attachedContext.map((item) => (
                <span key={item.id} className="coding-github-pr-attached__chip" title={`${item.title} · 관측 ${item.observedAt}`}>
                  {item.repoFullName}#{item.number}
                  {onDetach ? (
                    <button type="button" onClick={() => onDetach(item.id)} aria-label={`${item.repoFullName}#${item.number} 컨텍스트 제거`}>
                      <X size={10} aria-hidden />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}

          {listResult ? <PullRequestList result={listResult} selected={selected} onSelect={openDetail} /> : null}
          {detail ? (
            <>
              <PullRequestDetailView
                result={detail}
                repo={parseRepo(repoInput)}
                attachedContext={attachedContext}
                onAttach={onAttach}
              />
              {detail.outcome === "observed" && detail.data ? (
                <CommentComposer
                  body={commentBody}
                  onBodyChange={setCommentBody}
                  onPlan={planComment}
                  onExecute={executeComment}
                  busy={composerBusy}
                  plan={currentPlan}
                  notice={composerNotice}
                  executedHtmlUrl={executedHtmlUrl}
                  armed={armed}
                  onOpenArmDialog={() => setArmDialogOpen(true)}
                  onDisarm={disarm}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
      {armDialogOpen ? (
        <div className="coding-github-arm-dialog" role="dialog" aria-modal="true" aria-labelledby="github-arm-dialog-title">
          <div className="coding-github-arm-dialog__card">
            <h2 id="github-arm-dialog-title">
              <AlertTriangle size={16} aria-hidden /> GitHub 댓글 자동게시
            </h2>
            <p className="coding-github-arm-dialog__warning">{GITHUB_COMMENT_AUTOEXECUTE_WARNING}</p>
            <p className="coding-github-arm-dialog__note">
              유효 기간 30분 · 코드 변경·브랜치·PR 생성·머지는 포함되지 않습니다.
            </p>
            <div className="coding-github-arm-dialog__actions">
              <button type="button" onClick={() => setArmDialogOpen(false)}>
                취소
              </button>
              <button type="button" className="coding-github-arm-dialog__confirm" onClick={confirmArm}>
                이해했고 활성화
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CommentComposer({
  body, onBodyChange, onPlan, onExecute, busy, plan, notice, executedHtmlUrl, armed, onOpenArmDialog, onDisarm,
}: {
  body: string;
  onBodyChange: (value: string) => void;
  onPlan: () => void;
  onExecute: () => void;
  busy: boolean;
  plan: GithubCommentWritePlan | null;
  notice: string | null;
  executedHtmlUrl: string | null;
  armed: AutoExecuteArmedState | null;
  onOpenArmDialog: () => void;
  onDisarm: () => void;
}) {
  const armedNow = isArmed(armed);
  const canPlan = body.trim().length > 0 && !busy;
  const canExecute = !!plan && armedNow && !busy && !executedHtmlUrl;
  return (
    <div className="coding-github-pr-comment-composer" aria-label="GitHub 댓글 작성">
      <div className="coding-github-pr-comment-composer__head">
        <MessageSquarePlus size={12} aria-hidden />
        <span>댓글 작성</span>
        <span className="coding-github-pr-comment-composer__counter">{body.length}/16000</span>
        <span className="coding-github-pr-comment-composer__armed">
          {armedNow ? (
            <button type="button" onClick={onDisarm} title={`자동게시 활성 — ${armed?.expiresAt}`}>
              <StatusBadge size="sm" variant="warning">자동게시 ON</StatusBadge>
            </button>
          ) : (
            <button type="button" onClick={onOpenArmDialog} title="자동게시를 활성화하려면 경고 확인이 필요합니다">
              <StatusBadge size="sm" variant="muted">자동게시 OFF</StatusBadge>
            </button>
          )}
        </span>
      </div>
      <textarea
        className="coding-github-pr-comment-composer__textarea"
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        placeholder="댓글 본문 (markdown 가능). 비밀/토큰 패턴은 서버에서 거부됩니다."
        maxLength={16000}
        rows={4}
      />
      <div className="coding-github-pr-comment-composer__actions">
        <button type="button" disabled={!canPlan} onClick={onPlan}>
          초안 만들기
        </button>
        <button type="button" disabled={!canExecute} onClick={onExecute} title={armedNow ? "" : "자동게시가 꺼져 있어 게시할 수 없습니다"}>
          게시
        </button>
      </div>
      {plan ? (
        <div className="coding-github-pr-comment-plan">
          <p>
            <strong>plan {plan.id}</strong> · sha {plan.bodySha256.slice(0, 12)}… · {plan.bodyLength}자 · 상태{" "}
            <StatusBadge size="sm" variant="warning">{plan.status}</StatusBadge>
          </p>
          <pre className="coding-github-pr-comment-plan__preview">{plan.bodyPreview}</pre>
        </div>
      ) : null}
      {notice ? <p className="coding-github-pr__msg">{notice}</p> : null}
      {executedHtmlUrl ? (
        <p className="coding-github-pr__msg">
          관측됨 ·{" "}
          <a href={executedHtmlUrl} target="_blank" rel="noreferrer noopener">
            GitHub에서 보기
          </a>
        </p>
      ) : null}
    </div>
  );
}

function OutcomeLine({ outcome, message }: { outcome: GithubResourceResult<unknown>["outcome"]; message?: string }) {
  const label = githubOutcomeLabel(outcome);
  return (
    <p className="coding-github-pr-empty">
      <StatusBadge size="sm" variant={label.variant}>
        {label.text}
      </StatusBadge>
      {message ? <span className="coding-github-pr__msg"> {message}</span> : null}
    </p>
  );
}

function PullRequestList({
  result,
  selected,
  onSelect,
}: {
  result: GithubResourceResult<GithubPullRequestSummary[]>;
  selected: number | null;
  onSelect: (pullNumber: number) => void;
}) {
  if (result.outcome !== "observed") return <OutcomeLine outcome={result.outcome} message={result.message} />;
  const pulls = result.data ?? [];
  if (pulls.length === 0) {
    return (
      <p className="coding-github-pr-empty">
        <StatusBadge size="sm" variant="success">
          관측됨
        </StatusBadge>
        <span className="coding-github-pr__msg"> 열린 PR 없음</span>
      </p>
    );
  }
  return (
    <>
      <p className="coding-github-pr-empty">
        <StatusBadge size="sm" variant="success">
          관측됨
        </StatusBadge>
        <span className="coding-github-pr__msg">
          {" "}
          PR {pulls.length}개{result.observedAt ? ` · ${result.observedAt}` : ""}
        </span>
      </p>
      <ul className="coding-github-pr-list">
        {pulls.map((pull) => (
        <li key={pull.number}>
          <button
            type="button"
            className={`coding-github-pr-card ${selected === pull.number ? "active" : ""}`}
            onClick={() => onSelect(pull.number)}
          >
            <span className="coding-github-pr-card-head">
              <GitMerge size={11} aria-hidden />
              <strong>#{pull.number}</strong>
              <span className="coding-github-pr-card-title">{pull.title}</span>
            </span>
            <span className="coding-github-pr-card-meta">
              <StatusBadge size="sm" variant={pull.state === "open" ? "success" : "muted"}>
                {pull.draft ? "draft" : pull.state}
              </StatusBadge>
              {pull.author}
            </span>
          </button>
        </li>
      ))}
      </ul>
    </>
  );
}

function PullRequestDetailView({
  result,
  repo,
  attachedContext,
  onAttach,
}: {
  result: GithubResourceResult<GithubPullRequestDetail>;
  repo?: { owner: string; repo: string };
  attachedContext?: GithubContextAttachment[];
  onAttach?: (owner: string, repo: string, pullNumber: number) => void;
}) {
  if (result.outcome !== "observed" || !result.data) return <OutcomeLine outcome={result.outcome} message={result.message} />;
  const pr = result.data;
  const attached = repo ? isContextAttached(attachedContext, prContextKey(`${repo.owner}/${repo.repo}`, pr.number)) : false;
  return (
    <div className="coding-github-pr-detail">
      <div className="coding-github-pr-detail__head">
        <strong>
          #{pr.number} {pr.title}
        </strong>
        <StatusBadge size="sm" variant={pr.merged ? "primary" : pr.state === "open" ? "success" : "muted"}>
          {pr.merged ? "merged" : pr.draft ? "draft" : pr.state}
        </StatusBadge>
      </div>
      {repo && onAttach ? (
        <button
          type="button"
          className="coding-github-pr-detail__attach"
          onClick={() => onAttach(repo.owner, repo.repo, pr.number)}
          disabled={attached}
          title={attached ? "이미 이 세션 컨텍스트에 추가됨" : "이 PR을 코딩 컨텍스트에 추가(서버가 다시 읽어 확인)"}
        >
          {attached ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
          {attached ? "컨텍스트에 추가됨" : "컨텍스트에 추가"}
        </button>
      ) : null}
      <p className="coding-github-pr-detail__refs">
        {pr.baseRef} ← {pr.headRef} · {pr.author}
        {pr.additions !== null && pr.deletions !== null ? ` · +${pr.additions} / -${pr.deletions}` : ""}
        {pr.changedFiles !== null ? ` · 파일 ${pr.changedFiles}` : ""}
      </p>
      {pr.body.trim() ? <pre className="coding-github-pr-detail__body">{pr.body.slice(0, 4000)}</pre> : <p className="coding-github-pr__msg">설명 없음</p>}
      <p className="coding-github-pr-detail__src">
        {result.observedAt ? `관측 시각 ${result.observedAt}` : ""}
        {pr.htmlUrl ? (
          <>
            {" · "}
            <a href={pr.htmlUrl} target="_blank" rel="noreferrer noopener">
              GitHub에서 열기
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}
