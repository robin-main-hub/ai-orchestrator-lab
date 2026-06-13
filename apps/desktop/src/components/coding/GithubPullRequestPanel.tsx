import { useCallback, useEffect, useState } from "react";
import { Check, GitMerge, Github, Plus, RefreshCw, X } from "lucide-react";
import type { GithubContextAttachment, GithubPullRequestDetail, GithubPullRequestSummary } from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import {
  fetchGithubConnectorStatus,
  fetchGithubPullRequest,
  fetchGithubPullRequests,
  githubConnectorChipLabel,
  githubOutcomeLabel,
  type GithubConnectorView,
  type GithubResourceResult,
} from "../../lib/githubConnector";
import { isContextAttached, prContextKey } from "../../lib/githubContext";

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
}: {
  serverBaseUrl?: string | string[];
  defaultRepo?: string;
  /** GitHub context already attached to the active coding session (D2) */
  attachedContext?: GithubContextAttachment[];
  /** attach the selected PR — the workbench re-reads it server-side to confirm observed */
  onAttach?: (owner: string, repo: string, pullNumber: number) => void;
  onDetach?: (id: string) => void;
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
            <PullRequestDetailView
              result={detail}
              repo={parseRepo(repoInput)}
              attachedContext={attachedContext}
              onAttach={onAttach}
            />
          ) : null}
        </>
      )}
    </section>
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
