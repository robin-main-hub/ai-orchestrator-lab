import { Bot, LayoutGrid, ScrollText, Sparkles, TerminalSquare, X } from "lucide-react";
import { StatusBadge } from "@/ui/status-badge";
import { tmuxPaneRoleLabel } from "../lib/tmuxWorkbenchPresentation";
import type { CodexDetail } from "../lib/personaCodexDetail";
import { buildPersonaCard } from "../lib/personaCard";
import { PersonaCard } from "./PersonaCard";

/**
 * 캐릭터 상세 — 도감 카드를 클릭하면 열리는 가챠게임식 캐릭터 화면.
 * 큰 레어도 카드 + 선언 프로필(역할/권한/워크스테이션/Hermes 슬롯) +
 * SOUL.md 영혼 발췌 + 소환 액션. Presentational; 정적 마크업으로 검증.
 */
export function PersonaCodexModal({
  detail,
  avatarUrl,
  expressions,
  onClose,
  onSummonAutonomy,
  onSummonParallel,
  onOpenSwarm,
}: {
  detail: CodexDetail;
  avatarUrl?: string;
  /** 28표정 스프라이트 (agents/<slug>/expressions/<표정>.png) — 있으면 갤러리 표시 */
  expressions?: Record<string, string>;
  onClose: () => void;
  /** 자율실행 탭으로 이동 + 이 페르소나 프리필 */
  onSummonAutonomy: (personaName: string) => void;
  /** 병렬실행 탭으로 이동 + 첫 미션에 이 페르소나 프리필 */
  onSummonParallel: (personaName: string) => void;
  /** 매칭 워크스테이션이 있을 때 스웜 보드로 */
  onOpenSwarm?: () => void;
}) {
  const { entry } = detail;
  return (
    <div className="codex-modal__backdrop" role="dialog" aria-modal="true" aria-label={`${entry.displayName} 상세`} onClick={onClose}>
      <section className="codex-modal" onClick={(event) => event.stopPropagation()}>
        <button aria-label="닫기" className="codex-modal__close" onClick={onClose} type="button">
          <X size={16} aria-hidden />
        </button>

        <div className="codex-modal__columns">
          <div className="codex-modal__card">
            <PersonaCard
              card={buildPersonaCard({
                personaName: entry.personaName,
                displayName: entry.displayName,
                role: entry.role as never,
                avatarUrl,
              })}
            />
            <p className="codex-modal__caption">{entry.caption}</p>
          </div>

          <div className="codex-modal__info">
            <header className="codex-modal__head">
              <p className="codex-modal__eyebrow">CHARACTER FILE — agents/{entry.personaName}</p>
              <h2 className="codex-modal__name">{entry.displayName}</h2>
              <div className="codex-modal__badges">
                <StatusBadge variant="primary">{entry.role}</StatusBadge>
                {detail.permissionLevel ? <StatusBadge variant="muted">권한 {detail.permissionLevel}</StatusBadge> : null}
                {detail.paneRole ? (
                  <StatusBadge variant="success">배치 {tmuxPaneRoleLabel(detail.paneRole)}</StatusBadge>
                ) : (
                  <StatusBadge variant="warning">미배치 — 직접 배치 예정</StatusBadge>
                )}
                {detail.slotId ? (
                  <StatusBadge variant="reviewer">Hermes {detail.slotId}</StatusBadge>
                ) : (
                  <StatusBadge variant="muted">슬롯 미바인딩</StatusBadge>
                )}
              </div>
            </header>

            <div className="codex-modal__soul">
              <h3 className="codex-modal__soul-title">
                <ScrollText size={13} aria-hidden /> 영혼 발췌 — SOUL.md
              </h3>
              {detail.soulExcerpt ? (
                <p className="codex-modal__soul-text">{detail.soulExcerpt}…</p>
              ) : (
                <p className="codex-modal__soul-text codex-modal__soul-text--empty">
                  영혼 파일이 아직 비어 있습니다. (agents/{entry.personaName}/SOUL.md)
                </p>
              )}
            </div>

            {expressions && Object.keys(expressions).length > 0 ? (
              <div className="codex-modal__expressions">
                <h3 className="codex-modal__soul-title">
                  <Sparkles size={13} aria-hidden /> 표정 — {Object.keys(expressions).length}종
                </h3>
                <div className="codex-modal__expression-grid">
                  {Object.entries(expressions).map(([expression, url]) => (
                    <figure className="codex-modal__expression" key={expression}>
                      <img alt={expression} loading="lazy" src={url} />
                      <figcaption>{expression}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="codex-modal__actions">
              <button className="codex-modal__action codex-modal__action--primary" onClick={() => onSummonAutonomy(entry.personaName)} type="button">
                <Bot size={14} aria-hidden /> 자율실행으로 소환
              </button>
              <button className="codex-modal__action" onClick={() => onSummonParallel(entry.personaName)} type="button">
                <LayoutGrid size={14} aria-hidden /> 병렬 미션에 투입
              </button>
              {detail.paneRole && onOpenSwarm ? (
                <button className="codex-modal__action" onClick={onOpenSwarm} type="button">
                  <TerminalSquare size={14} aria-hidden /> 스웜 보드에서 보기
                </button>
              ) : null}
            </div>

            <p className="codex-modal__hint">
              <Sparkles size={11} aria-hidden /> 일러스트는 agents/{entry.personaName}/ 에 이미지를 넣으면 자동 반영됩니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
