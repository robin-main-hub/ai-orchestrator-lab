import { useEffect, useState } from "react";
import { Loader2, Square } from "lucide-react";
import { useCountUp } from "../lib/useCountUp";

/**
 * 현재 진행 중인 작업 한 건 — 홈의 "현재 작업"(페이지의 히어로)이 소비한다.
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
  /** 목표문 전체(있으면 label 대신 히어로에 크게 노출) */
  goal?: string;
  /** 시작 시각(ISO) — 경과 타이머 산출 */
  startedAt?: string;
  /** 누적 토큰 합계 — mono 카운트업 */
  tokensTotal?: number;
  /** 진행 반복 횟수 */
  iterations?: number;
};

/** 홈의 빈 상태에 쓰는 오빗 링 아트 (public/brand). */
const EMPTY_STATE_ART = `${import.meta.env.BASE_URL}brand/aol-empty-state.jpg`;

/**
 * 홈 상단의 전역 "현재 작업" 히어로. 진행 중인 작업을 라이브 텔레메트리(경과·토큰·
 * 상태점 맥동)와 함께 보여주고 항목별 중지를 붙인다. 진행 중인 게 없으면 오빗 링
 * 빈 상태 + "목표 루프에서 시작". 프레젠테이션 전용 — 폴링/정지 요청은 상위(App)가
 * 소유하고 onStop/onStart로 위임한다.
 */
export function RunningWorkCard({
  items,
  onStop,
  stoppingIds = [],
  onStart,
}: {
  items: RunningWorkItem[];
  onStop?: (id: string) => void;
  stoppingIds?: string[];
  /** 빈 상태 CTA — "목표 루프에서 시작" */
  onStart?: () => void;
}) {
  return (
    <section className="dashboard__section dashboard__running-section" aria-label="현재 작업">
      <h2 className="dashboard__section-title">현재 작업</h2>
      {items.length === 0 ? (
        <div className="running-empty">
          <img
            className="running-empty__art"
            src={EMPTY_STATE_ART}
            alt=""
            aria-hidden
            width={120}
            height={120}
          />
          <p className="running-empty__title">현재 작업 없음</p>
          <button className="running-empty__cta" onClick={() => onStart?.()} type="button">
            목표 루프에서 시작
          </button>
        </div>
      ) : (
        <ul className="running-list">
          {items.map((item) => (
            <RunningWorkRow
              item={item}
              key={item.id}
              onStop={onStop}
              stopping={stoppingIds.includes(item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RunningWorkRow({
  item,
  onStop,
  stopping,
}: {
  item: RunningWorkItem;
  onStop?: (id: string) => void;
  stopping: boolean;
}) {
  const isRunning = item.status === "running";
  const now = useNow(Boolean(item.startedAt) && isRunning);
  const elapsed = item.startedAt
    ? formatElapsed(now - new Date(item.startedAt).getTime())
    : null;
  const tokens = useCountUp(item.tokensTotal ?? 0);
  const goal = item.goal ?? item.label;

  return (
    <li className="running-card">
      <div className="running-card__head">
        <span
          className={`running-card__dot ${isRunning ? "is-live" : "is-idle"}`}
          aria-hidden
        />
        <span className="running-card__kind">{kindLabel(item.kind)}</span>
        <span className="running-card__status">{statusLabel(item.status)}</span>
        <button
          className="running-card__stop"
          disabled={stopping || !onStop}
          onClick={() => onStop?.(item.id)}
          title="이 작업 중지"
          type="button"
        >
          {stopping ? (
            <Loader2 className="running-card__spin" size={13} aria-hidden />
          ) : (
            <Square size={13} aria-hidden />
          )}
          {stopping ? "중지 중" : "중지"}
        </button>
      </div>
      <p className="running-card__goal" title={goal}>
        {goal}
      </p>
      <div className="running-card__meta">
        {elapsed ? (
          <span className="running-card__stat">
            <span className="running-card__stat-label">경과</span>
            <span className="running-card__stat-value aol-mono">{elapsed}</span>
          </span>
        ) : null}
        {item.tokensTotal != null ? (
          <span className="running-card__stat">
            <span className="running-card__stat-label">토큰</span>
            <span className="running-card__stat-value aol-mono">{tokens.toLocaleString()}</span>
          </span>
        ) : null}
        {item.iterations != null ? (
          <span className="running-card__stat">
            <span className="running-card__stat-label">반복</span>
            <span className="running-card__stat-value aol-mono">{item.iterations}</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** 활성일 때만 1초마다 갱신하는 시계 — 경과 타이머 구동. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

function kindLabel(kind: RunningWorkItem["kind"]): string {
  return kind === "rmas" ? "RMAS" : "자율";
}

function statusLabel(status: string): string {
  if (status === "running") return "진행 중";
  if (status === "queued") return "대기 중";
  return status;
}
