import { useState } from "react";
import { StatusBadge } from "@/ui/status-badge";
import type { WorkTraceSearchItem } from "../lib/workTraceSearch";
import { buildCodexDetail, type CodexDetail } from "../lib/personaCodexDetail";
import { personaBundleMap } from "../lib/personaBundleSource";
import { personaSprites } from "../lib/personaAvatarSource";
import { PersonaCodexModal } from "./PersonaCodexModal";
import type { CenterMode, NavItemId } from "../types";
import type { AutonomyRunSummary } from "../lib/autonomyRunHistory";
import { runHistoryStatusLabel, runHistoryStatusVariant } from "../lib/autonomyRunHistory";
import { loadHermesPool } from "../lib/hermesPoolStore";
import { buildPersonaCard } from "../lib/personaCard";
import { PERSONA_CODEX } from "../lib/personaCodex";
import { PersonaCard } from "./PersonaCard";

/**
 * 페르소나 — 소환진(오늘의 파티) + 캐릭터 도감을 담는 전용 뷰. 리디자인 S2에서
 * 홈(미션 컨트롤)을 관제실로 정리하며 이 캐릭터 쇼케이스를 홈에서 이 뷰로 그대로
 * 이관했다(기능 삭제 아님). 상세 모달·소환 동선은 종전과 동일하게 보존한다.
 */

export type PersonaViewPersona = {
  personaName: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
  tagline: string;
  /** 오늘 파티에 든 이유 (오늘 활성 / 최근 작전 / 오늘의 추천) */
  reason?: string;
};

export function PersonaView({
  personas,
  personaAvatars = {},
  history,
  onNavigate,
  onSummonPersona,
}: {
  personas: PersonaViewPersona[];
  personaAvatars?: Record<string, string | undefined>;
  history?: AutonomyRunSummary[];
  onNavigate: (target: { nav?: NavItemId; mode?: CenterMode }) => void;
  onSummonPersona?: (personaName: string, target: "autonomy" | "parallel") => void;
  /** "해온 업무" 요약 인덱스 (현 뷰에서는 미사용 — 시그니처 호환용) */
  workTraceItems?: WorkTraceSearchItem[];
}) {
  const recentRuns = (history ?? []).slice(0, 4);
  const [codexDetail, setCodexDetail] = useState<CodexDetail | null>(null);
  const [codexExpanded, setCodexExpanded] = useState(false);

  const openPersonaDetail = (personaName: string) => {
    const entry = PERSONA_CODEX.find((candidate) => candidate.personaName === personaName);
    if (!entry) return;
    setCodexDetail(buildCodexDetail(entry, { bundleMap: personaBundleMap, slots: loadHermesPool().slots }));
  };

  return (
    <div className="dashboard">
      <section className="dashboard__section" aria-label="페르소나 쇼케이스">
        <h2 className="dashboard__section-title">소환진 — 오늘의 파티</h2>
        <div className="dashboard__party">
          {personas.map((persona) => (
            <figure className="dashboard__party-member" key={persona.personaName}>
              <button
                className="dashboard__party-card"
                onClick={() => openPersonaDetail(persona.personaName)}
                title={`${persona.displayName} 상세 보기`}
                type="button"
              >
                {persona.reason ? <span className="dashboard__party-reason">{persona.reason}</span> : null}
                <PersonaCard
                  card={buildPersonaCard({
                    personaName: persona.personaName,
                    displayName: persona.displayName,
                    role: persona.role as never,
                    avatarUrl: persona.avatarUrl,
                  })}
                />
              </button>
              <figcaption className="dashboard__party-tagline">{persona.tagline}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="dashboard__section" aria-label="캐릭터 도감">
        <div className="dashboard__section-head">
          <h2 className="dashboard__section-title">캐릭터 도감 — 전원 {PERSONA_CODEX.length}인</h2>
          <button
            aria-expanded={codexExpanded}
            className="dashboard__section-toggle"
            onClick={() => setCodexExpanded((open) => !open)}
            type="button"
          >
            {codexExpanded ? "접기" : "전체 보기"}
          </button>
        </div>
        <div className={`dashboard__codex ${codexExpanded ? "is-expanded" : "is-carousel"}`}>
          {PERSONA_CODEX.map((entry) => (
            <button
              className="dashboard__codex-card"
              key={entry.personaName}
              onClick={() =>
                setCodexDetail(
                  buildCodexDetail(entry, { bundleMap: personaBundleMap, slots: loadHermesPool().slots }),
                )
              }
              title={`${entry.displayName} 상세 보기`}
              type="button"
            >
              <PersonaCard
                compact
                card={buildPersonaCard({
                  personaName: entry.personaName,
                  displayName: entry.displayName,
                  role: entry.role as never,
                  avatarUrl: personaAvatars[entry.personaName],
                })}
              />
              <span className="dashboard__codex-caption">{entry.caption}</span>
            </button>
          ))}
        </div>
      </section>

      {recentRuns.length > 0 ? (
        <section className="dashboard__section" aria-label="최근 자율실행">
          <h2 className="dashboard__section-title">최근 작전 기록</h2>
          <ul className="dashboard__runs">
            {recentRuns.map((run) => (
              <li className="dashboard__run" key={run.runId}>
                <span className="dashboard__run-persona">{run.personaName ?? "(이름 없음)"}</span>
                <span className="dashboard__run-goal" title={run.goal ?? ""}>
                  {run.goal ?? run.runId}
                </span>
                <StatusBadge variant={runHistoryStatusVariant(run.status)}>
                  {runHistoryStatusLabel(run.status)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {codexDetail ? (
        <PersonaCodexModal
          detail={codexDetail}
          avatarUrl={personaAvatars[codexDetail.entry.personaName]}
          expressions={personaSprites[codexDetail.entry.personaName]}
          onClose={() => setCodexDetail(null)}
          onSummonAutonomy={(personaName) => {
            setCodexDetail(null);
            onSummonPersona?.(personaName, "autonomy");
          }}
          onSummonParallel={(personaName) => {
            setCodexDetail(null);
            onSummonPersona?.(personaName, "parallel");
          }}
          onOpenSwarm={() => {
            setCodexDetail(null);
            onNavigate({ mode: "tmux" });
          }}
        />
      ) : null}
    </div>
  );
}
