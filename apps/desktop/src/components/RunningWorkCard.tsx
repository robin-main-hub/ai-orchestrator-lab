import { Loader2, Square } from "lucide-react";

/**
 * 현재 진행 중인 작업 한 건 — 홈의 "현재 작업 · 중지" 카드가 소비한다.
 * 완전 자동 운영이라 홈은 승인 attention 대신 "지금 무엇이 돌고 있고,
 * 필요하면 멈춘다"만 남긴다. (승인 신호 노출 금지)
 */
export type RunningWorkItem = {
  id: string;
  /** 사람이 읽는 이름 — 목표 미리보기 등 */
  label: string;
  /** 원 상태값 (running/queued 등) */
  status: string;
  kind: "rmas" | "autonomy";
};

/**
 * 홈 상단의 전역 "현재 작업" 컨트롤. 진행 중인 작업을 나열하고 각 항목에
 * 중지 버튼을 붙인다. 진행 중인 게 없으면 "현재 작업 없음". 프레젠테이션 전용 —
 * 폴링/정지 요청은 상위(App)가 소유하고 onStop으로 위임한다.
 */
export function RunningWorkCard({
  items,
  onStop,
  stoppingIds = [],
}: {
  items: RunningWorkItem[];
  onStop?: (id: string) => void;
  stoppingIds?: string[];
}) {
  return (
    <section className="dashboard__section dashboard__running-section" aria-label="현재 작업">
      <h2 className="dashboard__section-title">현재 작업</h2>
      {items.length === 0 ? (
        <p className="dashboard__running-empty">현재 작업 없음</p>
      ) : (
        <ul className="dashboard__running">
          {items.map((item) => {
            const stopping = stoppingIds.includes(item.id);
            return (
              <li className="dashboard__running-item" key={item.id}>
                <span className="dashboard__running-dot" aria-hidden />
                <span className="dashboard__running-kind">{kindLabel(item.kind)}</span>
                <span className="dashboard__running-label" title={item.label}>
                  {item.label}
                </span>
                <span className="dashboard__running-status">{statusLabel(item.status)}</span>
                <button
                  className="dashboard__running-stop"
                  disabled={stopping || !onStop}
                  onClick={() => onStop?.(item.id)}
                  title="이 작업 중지"
                  type="button"
                >
                  {stopping ? (
                    <Loader2 className="dashboard__running-spin" size={13} aria-hidden />
                  ) : (
                    <Square size={13} aria-hidden />
                  )}
                  {stopping ? "중지 중" : "중지"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function kindLabel(kind: RunningWorkItem["kind"]): string {
  return kind === "rmas" ? "RMAS" : "자율";
}

function statusLabel(status: string): string {
  if (status === "running") return "진행 중";
  if (status === "queued") return "대기 중";
  return status;
}
