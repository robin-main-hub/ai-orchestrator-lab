import { useMemo, useState } from "react";
import { Download, Save, X } from "lucide-react";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { createDefaultPersonaSettings, agentRoleLabel, formatModelDisplayName } from "../lib/helpers";
import {
  applySoulPresetToPersona,
  createSoulPresetFromPersona,
  getSoulPresetsForAgent,
  readAgentSoulPresetState,
  upsertSoulPreset,
  writeAgentSoulPresetState,
} from "../lib/agentSoulPresetStorage";
import {
  agentConfigPanelTitle,
  configSourceLabel,
  creativityLevelLabel,
  creativityTemperature,
  soulModeLabel,
  voicePresetLabel,
} from "../lib/uiLabels";
import type {
  AgentConfigFile,
  AgentConfigTab,
  AgentCreativityLevel,
  AgentPersonaSettings,
  AgentVoicePreset,
  WorkbenchAgent,
} from "../types";

function configFileOptionLabel(file: AgentConfigFile) {
  return `${file.label} / ${file.path}`;
}

export function AgentConfigDrawer({
  activeTab,
  agent,
  configFiles,
  memoryMode,
  onClose,
  onUpdateAgentConfig,
  onUpdatePersona,
  persona,
  provider,
  onReturn,
  returnLabel,
}: {
  activeTab: AgentConfigTab;
  agent: WorkbenchAgent;
  configFiles: AgentConfigFile[];
  memoryMode: string;
  onClose: () => void;
  onUpdateAgentConfig: (patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) => void;
  onUpdatePersona: (patch: Partial<AgentPersonaSettings>) => void;
  persona: AgentPersonaSettings;
  provider?: ProviderProfile;
  onReturn?: () => void;
  returnLabel?: string;
}) {
  const soulFiles = configFiles.filter((file) => file.kind === "soul");
  const agentsFiles = configFiles.filter((file) => file.kind === "agents");
  const [soulPresetState, setSoulPresetState] = useState(() => readAgentSoulPresetState());
  const soulPresets = useMemo(() => getSoulPresetsForAgent(soulPresetState, agent.id), [agent.id, soulPresetState]);
  const [selectedSoulPresetId, setSelectedSoulPresetId] = useState("");
  const selectedSoulPreset = soulPresets.find((preset) => preset.id === selectedSoulPresetId);

  function handleSaveSoulPreset() {
    const preset = createSoulPresetFromPersona({
      agentId: agent.id,
      label: `${agent.name} Soul ${new Date().toLocaleString("ko-KR", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
      })}`,
      persona,
    });
    const nextState = upsertSoulPreset(soulPresetState, preset);
    setSoulPresetState(nextState);
    setSelectedSoulPresetId(preset.id);
    writeAgentSoulPresetState(nextState);
  }

  function handleLoadSoulPreset() {
    if (!selectedSoulPreset) {
      return;
    }

    onUpdatePersona(applySoulPresetToPersona(selectedSoulPreset));
  }

  return (
    <aside className="agent-config-drawer" aria-label="에이전트 프로필 설정">
      <header>
        <div>
          <span>{agentConfigPanelTitle(activeTab)}</span>
          <strong>{agent.name}</strong>
        </div>
        {onReturn && returnLabel ? (
          <button
            className="agent-config-reset-button"
            onClick={onReturn}
            type="button"
            style={{
              background: "rgba(6, 182, 212, 0.15)",
              color: "var(--cyan)",
              borderColor: "rgba(6, 182, 212, 0.3)",
            }}
          >
            {returnLabel}
          </button>
        ) : null}
        <button
          className="agent-config-reset-button"
          onClick={() => onUpdatePersona(createDefaultPersonaSettings(agent))}
          type="button"
        >
          기본값
        </button>
        <button aria-label="Agent 설정 닫기" className="rail-icon-button" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </header>
      <div className="agent-config-body">
        {activeTab === "profile" ? (
          <div className="agent-config-grid">
            <label>
              <span>이름</span>
              <input readOnly value={agent.name} />
            </label>
            <label>
              <span>역할</span>
              <input readOnly value={agentRoleLabel(agent.role)} />
            </label>
            <label>
              <span>프로바이더</span>
              <input readOnly value={provider?.name ?? "프로바이더 미지정"} />
            </label>
            <label>
              <span>모델</span>
              <input readOnly value={formatModelDisplayName(agent.modelId ?? provider?.defaultModel)} />
            </label>
          </div>
        ) : null}
        {activeTab === "soul" ? (
          <div className="agent-config-stack soul-config-panel">
            <section className="agent-soul-preset-panel" aria-label="SOUL 저장 및 불러오기">
              <div>
                <strong>SOUL 저장본</strong>
                <span>지금 말투와 예시를 저장해 두고, 다른 실험 후에도 즉시 되돌릴 수 있습니다.</span>
              </div>
              <div className="agent-soul-preset-actions">
                <button type="button" onClick={handleSaveSoulPreset}>
                  <Save size={14} />
                  현재 Soul 저장
                </button>
                <select
                  aria-label="저장된 SOUL 선택"
                  value={selectedSoulPresetId}
                  onChange={(event) => setSelectedSoulPresetId(event.target.value)}
                >
                  <option value="">저장본 선택</option>
                  {soulPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={handleLoadSoulPreset} disabled={!selectedSoulPreset}>
                  <Download size={14} />
                  불러와 적용
                </button>
              </div>
            </section>
            <label>
              <span>라이브러리에서 선택</span>
              <select
                value={soulFiles.find((file) => file.path === persona.soulMdPath)?.id ?? ""}
                onChange={(event) => {
                  const file = soulFiles.find((candidate) => candidate.id === event.target.value);
                  if (!file) {
                    return;
                  }
                  onUpdatePersona({
                    soulMdPath: file.path,
                    soulSummary: file.body,
                  });
                }}
              >
                <option value="">직접 입력</option>
                {soulFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {configFileOptionLabel(file)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>SOUL.md 경로</span>
              <input value={persona.soulMdPath} onChange={(event) => onUpdatePersona({ soulMdPath: event.target.value })} />
            </label>
            <label>
              <span>SOUL.md 본문</span>
              <textarea
                value={persona.soulSummary}
                onChange={(event) => onUpdatePersona({ soulSummary: event.target.value })}
              />
            </label>
            <label>
              <span>예시 대화</span>
              <textarea
                value={persona.soulExampleDialogue}
                onChange={(event) => onUpdatePersona({ soulExampleDialogue: event.target.value })}
              />
            </label>
            <label>
              <span>SOUL.md가 없을 때 쓸 제안 소울</span>
              <select
                value={persona.voicePreset}
                onChange={(event) => onUpdatePersona({ voicePreset: event.target.value as AgentVoicePreset })}
              >
                {(["direct", "calm", "architect", "reviewer", "executor"] as AgentVoicePreset[]).map((preset) => (
                  <option key={preset} value={preset}>
                    {voicePresetLabel(preset)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>소울 모드</span>
              <select
                value={agent.soulMode}
                onChange={(event) => onUpdateAgentConfig({ soulMode: event.target.value as WorkbenchAgent["soulMode"] })}
                disabled={agent.configSource === "off"}
              >
                <option value="full">{soulModeLabel("full")}</option>
                <option value="summary">{soulModeLabel("summary")}</option>
                <option value="retrieved">{soulModeLabel("retrieved")}</option>
                <option value="off">{soulModeLabel("off")}</option>
              </select>
            </label>
            <p className="agent-config-note">
              이 화면은 SOUL.md만 다룹니다. AGENTS.md, 권한, 실행 소스는 중앙 컨트롤 바에서 각각 따로 열어 수정합니다.
            </p>
          </div>
        ) : null}
        {activeTab === "agents_md" ? (
          <div className="agent-config-stack">
            <label>
              <span>라이브러리에서 선택</span>
              <select
                value={agentsFiles.find((file) => file.path === persona.agentsMdPath)?.id ?? ""}
                onChange={(event) => {
                  const file = agentsFiles.find((candidate) => candidate.id === event.target.value);
                  if (!file) {
                    return;
                  }
                  onUpdatePersona({
                    agentsInstruction: file.body,
                    agentsMdPath: file.path,
                  });
                }}
              >
                <option value="">직접 입력</option>
                {agentsFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {configFileOptionLabel(file)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>AGENTS.md 경로</span>
              <input
                value={persona.agentsMdPath}
                onChange={(event) => onUpdatePersona({ agentsMdPath: event.target.value })}
              />
            </label>
            <label>
              <span>운영 지침</span>
              <textarea
                value={persona.agentsInstruction}
                onChange={(event) => onUpdatePersona({ agentsInstruction: event.target.value })}
              />
            </label>
          </div>
        ) : null}
        {activeTab === "creativity" ? (
          <div className="agent-config-stack">
            <div className="creativity-options" role="radiogroup" aria-label="창의성 단계">
              {(["strict", "focused", "balanced", "creative", "experimental"] as AgentCreativityLevel[]).map((level) => (
                <button
                  aria-checked={persona.creativityLevel === level}
                  className={persona.creativityLevel === level ? "active" : ""}
                  key={level}
                  onClick={() => onUpdatePersona({ creativityLevel: level })}
                  role="radio"
                  type="button"
                >
                  <strong>{creativityLevelLabel(level)}</strong>
                  <span>temp {creativityTemperature(level).toFixed(1)}</span>
                </button>
              ))}
            </div>
            <p className="agent-config-note">
              보수적일수록 검증과 일관성을 우선하고, 창의적일수록 새로운 제안과 대안을 더 적극적으로 냅니다.
            </p>
            <label>
              <span>금기 / 피할 말투</span>
              <textarea
                value={persona.forbiddenStyle}
                onChange={(event) => onUpdatePersona({ forbiddenStyle: event.target.value })}
              />
            </label>
          </div>
        ) : null}
        {activeTab === "injection" ? (
          <div className="agent-config-grid">
            <label>
              <span>설정 소스</span>
              <select
                value={agent.configSource}
                onChange={(event) =>
                  onUpdateAgentConfig({ configSource: event.target.value as WorkbenchAgent["configSource"] })
                }
              >
                <option value="internal">{configSourceLabel("internal")}</option>
                <option value="markdown">{configSourceLabel("markdown")}</option>
                <option value="off">{configSourceLabel("off")}</option>
              </select>
            </label>
            <label>
              <span>소울 모드</span>
              <select
                value={agent.soulMode}
                onChange={(event) => onUpdateAgentConfig({ soulMode: event.target.value as WorkbenchAgent["soulMode"] })}
                disabled={agent.configSource === "off"}
              >
                <option value="full">{soulModeLabel("full")}</option>
                <option value="summary">{soulModeLabel("summary")}</option>
                <option value="retrieved">{soulModeLabel("retrieved")}</option>
                <option value="off">{soulModeLabel("off")}</option>
              </select>
            </label>
            <p className="agent-config-note">
              현재 실행에는 {configSourceLabel(agent.configSource)} 하나만 주입됩니다. Memory는 {memoryMode}입니다.
            </p>
          </div>
        ) : null}
        {activeTab === "preview" ? (
          <pre className="agent-config-preview">
            {`소스: ${configSourceLabel(agent.configSource)}
소울 모드: ${soulModeLabel(agent.soulMode)}
대체 소울: ${voicePresetLabel(persona.voicePreset)}
창의성: ${creativityLevelLabel(persona.creativityLevel)} / 온도 ${creativityTemperature(persona.creativityLevel).toFixed(1)}
AGENTS.md: ${agent.configSource === "markdown" ? persona.agentsMdPath : "주입 안 됨"}
SOUL.md: ${agent.configSource === "markdown" ? persona.soulMdPath : "주입 안 됨"}

${agent.configSource === "internal" ? persona.soulSummary : "마크다운 소스 선택됨 · 파일 내용은 경로 기준으로 불러옵니다"}
예시:
${persona.soulExampleDialogue}

${persona.agentsInstruction}
피할 표현: ${persona.forbiddenStyle}`}
          </pre>
        ) : null}
        {activeTab === "edit" ? (
          <div className="agent-config-stack">
            <label>
              <span>설정 소스</span>
              <select
                value={agent.configSource}
                onChange={(event) =>
                  onUpdateAgentConfig({ configSource: event.target.value as WorkbenchAgent["configSource"] })
                }
              >
                <option value="internal">앱 내부 설정</option>
                <option value="markdown">AGENTS.md / SOUL.md</option>
                <option value="off">사용 안 함</option>
              </select>
            </label>
            <p className="agent-config-note">둘 다 저장할 수는 있지만, 한 턴에 주입되는 설정 소스는 반드시 하나입니다.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
