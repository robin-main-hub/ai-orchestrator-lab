import { useEffect, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { agentRoleLabel } from "../lib/helpers";
import { agentRoleOptions } from "../lib/appConstants";
import type { AgentVisualSettings, WindowAuditItem, WorkbenchAgent } from "../types";
import { AgentAvatar } from "./AgentAvatar";
import { AutonomySlider, type AutonomyLevel } from "./AutonomySlider";
import { WindowChecklist } from "./WindowChecklist";
export function AgentSettingsPanel({
  agent,
  onClearAvatar,
  onClose,
  onUpdateAgent,
  onUploadAvatar,
  visual,
}: {
  agent: WorkbenchAgent;
  onClearAvatar: (agentId: string) => void;
  onClose: () => void;
  onUpdateAgent: (agentId: string, patch: Partial<Pick<WorkbenchAgent, "name" | "role">>) => void;
  onUploadAvatar: (agentId: string, file: File) => void;
  visual: AgentVisualSettings;
}) {
  const [draftName, setDraftName] = useState(agent.name);

  useEffect(() => {
    setDraftName(agent.name);
  }, [agent.id, agent.name]);

  function commitName() {
    const nextName = draftName.trim();
    if (!nextName) {
      setDraftName(agent.name);
      return;
    }
    if (nextName !== agent.name) {
      onUpdateAgent(agent.id, { name: nextName });
    }
  }
  const auditItems: WindowAuditItem[] = [
    {
      id: "name",
      label: "이름",
      status: draftName.trim() ? "ready" : "partial",
      detail: "에이전트 표시명은 tmux pane, 대화 상대, 기록에 함께 반영됩니다.",
    },
    {
      id: "role",
      label: "역할",
      status: "ready",
      detail: "지휘자/설계자/검토자/실행자 같은 역할을 여기서 바꿉니다.",
    },
    {
      id: "avatar",
      label: "프로필 사진",
      status: visual.avatarDataUrl ? "ready" : "partial",
      detail: "업로드 이미지는 data URL로 저장해 외부 접속에서도 경로가 깨지지 않게 합니다.",
    },
    {
      id: "event-record",
      label: "설정 기록",
      status: "ready",
      detail: "이름, 역할, 이미지 변경은 Event Storage에 남길 준비가 되어 있습니다.",
    },
  ];

  return (
    <section className="agent-settings-modal" aria-label="Agent profile settings">
      <header>
        <div className="agent-settings-title">
          <AgentAvatar agent={agent} size="large" visual={visual} />
          <div>
            <span>Agent Settings</span>
            <strong>{agent.name}</strong>
          </div>
        </div>
        <button aria-label="agent settings close" className="icon-button" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </header>
      <div className="agent-settings-body">
        <label>
          <span>이름</span>
          <input
            onBlur={commitName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            value={draftName}
          />
        </label>
        <label>
          <span>역할</span>
          <select
            onChange={(event) =>
              onUpdateAgent(agent.id, {
                role: event.target.value as WorkbenchAgent["role"],
              })
            }
            value={agent.role}
          >
            {agentRoleOptions.map((role) => (
              <option key={role} value={role}>
                {agentRoleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <div className="agent-avatar-editor">
          <div>
            <span>프로필 사진</span>
            <strong>{visual.avatarDataUrl ? "embedded data URL" : "기본 이니셜"}</strong>
            <p>로컬 파일 경로가 아니라 이미지 데이터를 저장해서 집 밖 접속에서도 깨지지 않게 이어갈 수 있게 한다.</p>
          </div>
          <label className="avatar-upload-button">
            <ImageIcon size={14} />
            업로드
            <input
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUploadAvatar(agent.id, file);
                }
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          <button className="ghost-button" disabled={!visual.avatarDataUrl} onClick={() => onClearAvatar(agent.id)} type="button">
            초기화
          </button>
        </div>
        <AutonomySlider
          hint="🟡 v1: UI 미리보기. permission gate 후속 PR에서 runtime 과 wiring."
          initialLevel={initialAutonomyForRole(agent.role)}
        />
        <div className="agent-settings-note">
          <span>tmux 준비 상태</span>
          <strong>이름 / 역할 / avatar는 Event Storage에 기록되고, 실제 tmux runner 연결 전까지 UI와 handoff 기록에서 먼저 사용한다.</strong>
        </div>
      </div>
      <WindowChecklist items={auditItems} title="에이전트 설정 점검" />
    </section>
  );
}

/**
 * design-decisions.md §8 — 채아린(companion) Level 3, Maomao(researcher)
 * read-only 작업 Level 4, Executor 같은 위험 role 은 Level 3 이하.
 */
function initialAutonomyForRole(role: WorkbenchAgent["role"]): AutonomyLevel {
  switch (role) {
    case "executor":
    case "builder":
      return 3;
    case "researcher":
    case "memory_curator":
      return 4;
    case "auditor":
    case "verifier":
    case "reviewer":
      return 2;
    case "skeptic":
    case "domain_expert":
      return 2;
    case "orchestrator":
    case "architect":
      return 3;
    case "companion":
    case "external":
    default:
      return 3;
  }
}

