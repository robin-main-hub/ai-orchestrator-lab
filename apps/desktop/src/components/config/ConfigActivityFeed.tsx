import { History } from "lucide-react";
import { PersonaChip } from "@/components/persona/PersonaChip";
import type { AgentConfigFile, WorkbenchAgent } from "../../types";

/**
 * CFG-E — 활동 피드. configFiles 의 updatedAt/version 에서만 파생한다
 * (신규 prop·eventLog 배선 금지, §0-B 최소화 — 최근 몇 건이면 충분).
 * 서명은 착용 캐릭터(PersonaChip 20px); 착용자가 없으면 정직하게 "미착용"
 * 뉴트럴 표기만 하고 가짜 캐릭터를 배정하지 않는다(§1.2 rule 4).
 */

const MAX_FEED_ENTRIES = 5;

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return "시간 미상";
  }
  const diffMs = Math.max(0, now - at);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "방금 전";
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }
  return `${Math.floor(hours / 24)}일 전`;
}

export function ConfigActivityFeed({
  configFiles,
  agents,
}: {
  configFiles: AgentConfigFile[];
  agents: WorkbenchAgent[];
}) {
  const entries = [...configFiles]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_FEED_ENTRIES);

  return (
    <div className="config-v2__activity" aria-label="최근 활동">
      <div className="config-v2__section-title">
        <History size={14} />
        <strong>최근 활동</strong>
      </div>
      {entries.length === 0 ? (
        <p className="config-v2__activity-empty">아직 활동이 없습니다.</p>
      ) : (
        <ul className="config-v2__activity-list">
          {entries.map((file) => {
            const wearer = file.linkedAgentIds
              .map((id) => agents.find((agent) => agent.id === id))
              .find((agent): agent is WorkbenchAgent => Boolean(agent));
            return (
              <li className="config-v2__activity-row" key={file.id}>
                {wearer ? (
                  <PersonaChip
                    personaName={wearer.personaName}
                    role={wearer.role}
                    name={wearer.name}
                    size={20}
                  />
                ) : (
                  <em className="config-v2__unworn">미착용</em>
                )}
                <span className="config-v2__activity-text">
                  {file.label} <span className="aol-mono">v{file.version}</span> 갱신됨
                </span>
                <span className="config-v2__activity-time aol-mono">{formatRelativeTime(file.updatedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
