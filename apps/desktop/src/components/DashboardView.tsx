import { Code2, Repeat, Swords } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkTraceSearchItem } from "../lib/workTraceSearch";
import { WorkReceiptLedgerCard } from "./operator-cockpit/WorkReceiptLedgerCard";
import { RunningWorkCard, type RunningWorkItem } from "./RunningWorkCard";
import type { RuntimeSnapshot, RuntimeStatus } from "@ai-orchestrator/protocol";
import type { CenterMode, NavItemId } from "../types";
import type { HermesPoolSummary } from "../lib/hermesSlotPool";

/**
 * 홈 — 오케스트레이터 관제실(미션 컨트롤). "지금 무엇이 돌고 있고(현재 작업),
 * 무엇을 해왔는가(해온 업무)"만 남긴 다크 시네마틱 한 화면. 화려함의 출처는
 * 캐릭터 장식이 아니라 살아있는 텔레메트리(상태점 맥동·토큰 카운트업)다.
 * 배경은 앰비언트 아트 + 그라디언트 스크림(텍스트 대비 안전)이며 홈에만 깔린다.
 * 페르소나 쇼케이스/도감은 "페르소나" 뷰로 이관됐다.
 */

const AMBIENT_BG = `${import.meta.env.BASE_URL}brand/aol-ambient-bg.jpg`;

type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  target: { nav?: NavItemId; mode?: CenterMode };
};

// 빠른 시작 — 한 줄, 세 개만. (스펙 §4: 목표 루프 / 토론 / 코딩)
const QUICK_ACTIONS: QuickAction[] = [
  { id: "rmas", label: "목표 루프", icon: Repeat, target: { nav: "rmas" } },
  { id: "debate", label: "토론", icon: Swords, target: { nav: "none", mode: "debate" } },
  { id: "coding", label: "코딩", icon: Code2, target: { nav: "coding" } },
];

const DGX_STATUS_LABEL: Record<RuntimeStatus, string> = {
  online: "온라인",
  degraded: "저하",
  offline: "오프라인",
  syncing: "동기화 중",
};

/** 상태점 색·맥동 클래스 — online만 "라이브"(맥동), 나머지는 정적 의미색. */
function dotClass(status: RuntimeStatus): string {
  if (status === "online") return "home__dot is-online is-live";
  if (status === "offline") return "home__dot is-offline";
  return "home__dot is-degraded";
}

export function DashboardView({
  runtime,
  hermesPool,
  onNavigate,
  workTraceItems = [],
  runningWork = [],
  onStopWork,
  stoppingWorkIds = [],
}: {
  runtime: RuntimeSnapshot;
  hermesPool: HermesPoolSummary;
  onNavigate: (target: { nav?: NavItemId; mode?: CenterMode }) => void;
  /** "해온 업무" 요약에 쓰는 작업 추적 인덱스 (append-only 공개 영수증) */
  workTraceItems?: WorkTraceSearchItem[];
  /** 지금 진행 중인 작업 (RMAS 실행 등) */
  runningWork?: RunningWorkItem[];
  /** "현재 작업" 항목 중지 요청 */
  onStopWork?: (id: string) => void;
  /** 중지 요청이 진행 중인 항목 id */
  stoppingWorkIds?: string[];
}) {
  const totalNodes = runtime.runtimeNodes.length;
  const onlineNodes = runtime.runtimeNodes.filter((node) => node.status === "online").length;
  const runtimeStatus: RuntimeStatus =
    totalNodes > 0 && onlineNodes === totalNodes
      ? "online"
      : onlineNodes === 0
        ? "offline"
        : "degraded";
  const dgxStatus = runtime.dgxStatus;

  return (
    <div className="home">
      <div className="home__ambient" aria-hidden>
        <img className="home__ambient-img" src={AMBIENT_BG} alt="" />
        <div className="home__ambient-scrim" />
      </div>

      <div className="home__content">
        {/* ① 상태 스트립 — 한 줄, mono 숫자, 라이브 상태에만 맥동점 */}
        <div className="home__strip" role="status" aria-label="시스템 상태">
          <span className="home__strip-item">
            <span className={dotClass(runtimeStatus)} aria-hidden />
            <span className="home__strip-label">런타임</span>
            <strong className="aol-mono">
              {onlineNodes}/{totalNodes}
            </strong>
            <span className="home__strip-unit">온라인</span>
          </span>
          <span className="home__strip-sep" aria-hidden />
          <span className="home__strip-item">
            <span className="home__strip-label">Hermes 슬롯</span>
            <span className="home__strip-unit">사용</span>
            <strong className="aol-mono">{hermesPool.bound}</strong>
            <span className="home__strip-unit">여유</span>
            <strong className="aol-mono">{hermesPool.spare}</strong>
          </span>
          <span className="home__strip-sep" aria-hidden />
          <span className="home__strip-item">
            <span className={dotClass(dgxStatus)} aria-hidden />
            <span className="home__strip-label">DGX</span>
            <strong>{DGX_STATUS_LABEL[dgxStatus]}</strong>
          </span>
        </div>

        {/* ② 현재 작업 — 페이지의 히어로 (라이브 텔레메트리 + 중지) */}
        <RunningWorkCard
          items={runningWork}
          onStop={onStopWork}
          onStart={() => onNavigate({ nav: "rmas" })}
          stoppingIds={stoppingWorkIds}
        />

        {/* ③ 해온 업무 — 작업 영수증 compact 최근 5 */}
        <section className="dashboard__section" aria-label="해온 업무">
          <h2 className="dashboard__section-title">해온 업무</h2>
          <WorkReceiptLedgerCard compact items={workTraceItems} />
        </section>

        {/* ④ 빠른 시작 — 한 줄 3버튼 */}
        <section className="dashboard__section" aria-label="빠른 시작">
          <h2 className="dashboard__section-title">빠른 시작</h2>
          <div className="home__quick">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  className="home__quick-btn"
                  key={action.id}
                  onClick={() => onNavigate(action.target)}
                  type="button"
                >
                  <Icon size={16} aria-hidden />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
