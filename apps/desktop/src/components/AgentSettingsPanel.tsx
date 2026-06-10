import { useEffect, useState } from "react";
import { ImageIcon, X, ChevronDown } from "lucide-react";
import { agentRoleLabel } from "../lib/helpers";
import { agentRoleOptions } from "../lib/appConstants";
import type { AgentVisualSettings, WorkbenchAgent } from "../types";
import { AgentAvatar } from "./AgentAvatar";
import { AutonomySlider, type AutonomyLevel } from "./AutonomySlider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";

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

  return (
    <section className="agent-settings-modal" aria-label="에이전트 프로필 설정">
      <header>
        <div className="agent-settings-title">
          <AgentAvatar agent={agent} size="large" visual={visual} />
          <div>
            <span>에이전트 설정</span>
            <strong>{agent.name}</strong>
          </div>
        </div>
        <button aria-label="에이전트 설정 닫기" className="icon-button" onClick={onClose} type="button">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="역할 선택"
                className="flex w-full items-center justify-between rounded border border-input bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                type="button"
              >
                <span>{agentRoleLabel(agent.role)}</span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {agentRoleOptions.map((role) => (
                <DropdownMenuItem
                  key={role}
                  onSelect={() =>
                    onUpdateAgent(agent.id, {
                      role: role as WorkbenchAgent["role"],
                    })
                  }
                >
                  <span>{agentRoleLabel(role)}</span>
                  {role === agent.role ? (
                    <span className="ml-auto text-[10px] text-primary font-medium">사용 중</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </label>
        <div className="agent-avatar-editor">
          <div>
            <span>프로필 사진</span>
            <strong>{visual.avatarDataUrl ? "내장 이미지 데이터" : "기본 이니셜"}</strong>
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
          hint="🟡 v1: UI 미리보기. 권한 게이트 후속 PR에서 런타임과 연결합니다."
          initialLevel={initialAutonomyForRole(agent.role)}
        />
        <div className="agent-settings-note">
          <span>tmux 준비 상태</span>
          <strong>이름 / 역할 / 아바타는 이벤트 저장소에 기록되고, 실제 tmux 실행기 연결 전까지 UI와 인계 기록에서 먼저 사용한다.</strong>
        </div>
      </div>
    </section>
  );
}

/**
 * design-decisions.md §8 — 쿠루미(companion) Level 3, Maomao(researcher)
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
