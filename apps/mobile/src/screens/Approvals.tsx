import { useEffect, useMemo, useState } from "react";
import type { ApprovalQueueItem, ApprovalRequest } from "@ai-orchestrator/protocol";
import { getJson, MobileApiError, postJson } from "../lib/api";

type Props = {
  onBack: () => void;
};

type ApprovalListResponse = {
  approvals: ApprovalRequest[];
  queue: ApprovalQueueItem[];
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
  };
  createdAt: string;
};

type DecisionResponse = {
  approval: ApprovalRequest;
  status: "approved" | "rejected";
};

export function Approvals({ onBack }: Props) {
  const [data, setData] = useState<ApprovalListResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const pending = data?.queue ?? [];
  const history = useMemo(
    () => (data?.approvals ?? []).filter((approval) => approval.state !== "required").slice(0, 12),
    [data?.approvals],
  );

  useEffect(() => {
    void loadApprovals();
  }, []);

  async function loadApprovals() {
    setLoading(true);
    setError(undefined);
    try {
      setData(await getJson<ApprovalListResponse>("/approvals/list"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function decide(item: ApprovalQueueItem, state: DecisionResponse["status"]) {
    setWorkingId(item.sourceItemId);
    setError(undefined);
    try {
      await postJson<DecisionResponse>(state === "approved" ? "/approvals/grant" : "/approvals/reject", {
        sourceItemId: item.sourceItemId,
        actor: "mobile",
        reason: state === "approved" ? "approved from mobile approval queue" : "rejected from mobile approval queue",
      });
      await loadApprovals();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorkingId(undefined);
    }
  }

  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ←
        </button>
        <div className="screen__title">승인 큐</div>
        <button type="button" className="screen__action" onClick={() => void loadApprovals()} disabled={loading}>
          새로고침
        </button>
      </header>
      <div className="screen__body">
        <section className="section approval-summary">
          <div>
            <div className="section__title">DGX-02 승인 대기</div>
            <div className="settings__hint">provider 호출, remote run, 이후 tmux dispatch가 여기에 쌓입니다.</div>
          </div>
          <span className={`chip chip--${pending.length > 0 ? "limited" : "trusted"}`}>
            {loading ? "확인 중" : `${pending.length} pending`}
          </span>
        </section>

        {error ? <div className="screen__error">{error}</div> : null}

        {pending.length === 0 ? (
          <div className="screen__empty">{loading ? "승인 큐를 불러오는 중입니다." : "현재 승인 대기 항목이 없습니다."}</div>
        ) : (
          pending.map((item) => (
            <section key={item.id} className="section approval-card">
              <div className="approval-card__head">
                <div>
                  <div className="row__label">{item.summary}</div>
                  <div className="approval-card__meta">
                    {item.requestedBy} · {item.permissions.join(", ") || "read_only"}
                  </div>
                </div>
                <span className="chip chip--limited">{item.state}</span>
              </div>
              <div className="approval-card__time">
                요청: {new Date(item.createdAt).toLocaleString("ko-KR")}
                {item.expiresAt ? ` · 만료: ${new Date(item.expiresAt).toLocaleString("ko-KR")}` : ""}
              </div>
              <div className="approval-card__actions">
                <button
                  type="button"
                  className="button button--accent"
                  disabled={workingId === item.sourceItemId}
                  onClick={() => void decide(item, "approved")}
                >
                  승인
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={workingId === item.sourceItemId}
                  onClick={() => void decide(item, "rejected")}
                >
                  거절
                </button>
              </div>
            </section>
          ))
        )}

        {history.length > 0 ? (
          <section className="section">
            <div className="section__title">최근 처리</div>
            {history.map((approval) => (
              <div key={approval.id} className="row">
                <div>
                  <div className="row__label">{approval.subjectId}</div>
                  <div className="approval-card__meta">{approval.action}</div>
                </div>
                <span className={`chip chip--${approval.state === "approved" ? "trusted" : "unknown"}`}>
                  {approval.state}
                </span>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof MobileApiError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "승인 큐를 처리하지 못했습니다.";
}
