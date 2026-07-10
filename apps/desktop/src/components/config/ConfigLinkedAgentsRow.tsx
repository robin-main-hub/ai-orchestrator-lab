import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { PersonaChip } from "@/components/persona/PersonaChip";
import type { WorkbenchAgent } from "../../types";

/**
 * CFG-C — 착용 에이전트 편집 행(화면의 척추).
 * "이 파일을 지금 누가 입고 있는가"를 칩으로 보여주고, X(해제)·+(착용) 편집을
 * 기존 linkedAgentIds 갱신 콜백 하나로 수행한다. 신규 App 배선 없음:
 * agents prop 은 PR①(CFG-B)이 배선했고, 변경은 onChange(next linkedAgentIds)
 * → onUpdateConfigFile(id, { linkedAgentIds }) 로만 흐른다.
 * 신원 없는 id(삭제된 에이전트 등)는 렌더하지 않는다(가짜 배정 금지, §1.2 rule 4).
 */

/**
 * 에이전트 선택 팝오버 버튼 — 착용 행의 "+"와 프로필 팩의 "적용"이 공유.
 * 비모달 보조 팝오버라 z-rail(20)층, 바깥 클릭/Escape 로 닫힘.
 */
export function AgentPickButton({
  agents,
  excludeIds = [],
  onPick,
  buttonLabel,
  buttonTitle,
  buttonClassName,
  emptyLabel = "추가할 에이전트가 없습니다",
}: {
  agents: WorkbenchAgent[];
  excludeIds?: string[];
  onPick: (agent: WorkbenchAgent) => void;
  buttonLabel: ReactNode;
  buttonTitle: string;
  buttonClassName?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const candidates = agents.filter((agent) => !excludeIds.includes(agent.id));

  return (
    <span className="config-v2__pickwrap" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        className={buttonClassName ?? "config-v2__icon-button"}
        onClick={() => setOpen((current) => !current)}
        title={buttonTitle}
        type="button"
      >
        {buttonLabel}
      </button>
      {open ? (
        <div className="config-v2__picker" aria-label={buttonTitle}>
          {candidates.length === 0 ? (
            <span className="config-v2__picker-empty">{emptyLabel}</span>
          ) : (
            candidates.map((agent) => (
              <button
                className="config-v2__picker-option"
                key={agent.id}
                onClick={() => {
                  onPick(agent);
                  setOpen(false);
                }}
                type="button"
              >
                <PersonaChip
                  personaName={agent.personaName}
                  role={agent.role}
                  name={agent.name}
                  size={24}
                />
              </button>
            ))
          )}
        </div>
      ) : null}
    </span>
  );
}

export function ConfigLinkedAgentsRow({
  agents,
  linkedAgentIds,
  onChange,
}: {
  agents: WorkbenchAgent[];
  linkedAgentIds: string[];
  onChange: (nextLinkedAgentIds: string[]) => void;
}) {
  const wornAgents = linkedAgentIds
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent): agent is WorkbenchAgent => Boolean(agent));

  return (
    <div className="config-v2__wearers">
      <span className="config-v2__wearers-label">착용 에이전트</span>
      {wornAgents.length === 0 ? <em className="config-v2__unworn">미착용</em> : null}
      {wornAgents.map((agent) => (
        <span className="config-v2__wear-chip" key={agent.id}>
          <PersonaChip
            personaName={agent.personaName}
            role={agent.role}
            name={agent.name}
            size={24}
          />
          <button
            aria-label={`${agent.name} 착용 해제`}
            className="config-v2__wear-remove"
            onClick={() => onChange(linkedAgentIds.filter((id) => id !== agent.id))}
            title={`${agent.name} 착용 해제`}
            type="button"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <AgentPickButton
        agents={agents}
        excludeIds={linkedAgentIds}
        onPick={(agent) => onChange([...linkedAgentIds, agent.id])}
        buttonLabel={<Plus size={14} />}
        buttonTitle="착용 에이전트 추가"
        emptyLabel="모든 에이전트가 이미 착용 중입니다"
      />
    </div>
  );
}
