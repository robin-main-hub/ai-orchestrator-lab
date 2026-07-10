import { useState } from "react";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import type {
  AgentConfigFile,
  AgentConfigFileKind,
  AgentProfilePack,
  WorkbenchAgent,
} from "../types";
import { initialAgentConfigFiles, initialAgentProfilePacks } from "../seeds/configFiles";

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type AgentConfigFilesControllerInput = {
  appendEvent: AppendWorkbenchEvent;
  selectedAgent?: WorkbenchAgent;
};

export function useAgentConfigFilesController({
  appendEvent,
  selectedAgent,
}: AgentConfigFilesControllerInput) {
  const [agentConfigFiles, setAgentConfigFiles] = useState<AgentConfigFile[]>(initialAgentConfigFiles);
  const [agentProfilePacks] = useState<AgentProfilePack[]>(initialAgentProfilePacks);
  const [selectedConfigFileId, setSelectedConfigFileId] = useState(initialAgentConfigFiles[0]?.id);

  function createConfigFileDraft(kind: AgentConfigFileKind): AgentConfigFile {
    const createdAt = new Date().toISOString();
    const index = agentConfigFiles.filter((file) => file.kind === kind).length + 1;
    const kindPath: Record<AgentConfigFileKind, string> = {
      agents: "agents/shared/AGENTS.md",
      memory_policy: "agents/policies/MEMORY.md",
      prompt_template: "agents/templates/prompt.md",
      skill: "agents/skills/SKILL.md",
      soul: "agents/new-agent/SOUL.md",
    };
    const kindLabel: Record<AgentConfigFileKind, string> = {
      agents: "AGENTS.md",
      memory_policy: "Memory Policy",
      prompt_template: "Prompt Template",
      skill: "SKILL.md",
      soul: "SOUL.md",
    };

    return {
      id: `config_${kind}_${Date.now()}`,
      body: `${kindLabel[kind]} 초안\n\n- 목적:\n- 적용 대상:\n- 금기/주의:\n`,
      kind,
      label: `${kindLabel[kind]} 초안 ${index}`,
      linkedAgentIds: selectedAgent ? [selectedAgent.id] : [],
      path: kindPath[kind],
      scope: kind === "soul" ? "agent" : "project",
      tags: ["draft"],
      updatedAt: createdAt,
      version: 1,
    };
  }

  function handleCreateConfigFile(kind: AgentConfigFileKind) {
    const nextFile = createConfigFileDraft(kind);
    setAgentConfigFiles((files) => [nextFile, ...files]);
    setSelectedConfigFileId(nextFile.id);
    appendEvent("agent.config_file.created", {
      configFileId: nextFile.id,
      kind: nextFile.kind,
      label: nextFile.label,
      path: nextFile.path,
      rawSecretPersisted: false,
    });
  }

  function handleDuplicateConfigFile(configFileId: string) {
    const source = agentConfigFiles.find((file) => file.id === configFileId);
    if (!source) {
      return;
    }
    const nextFile: AgentConfigFile = {
      ...source,
      id: `config_${source.kind}_${Date.now()}`,
      label: `${source.label} 복사본`,
      updatedAt: new Date().toISOString(),
      // CFG-D: 복제본은 새 파일의 v1에서 시작한다(원본 버전 계승 아님).
      version: 1,
    };
    setAgentConfigFiles((files) => [nextFile, ...files]);
    setSelectedConfigFileId(nextFile.id);
    appendEvent("agent.config_file.duplicated", {
      configFileId: nextFile.id,
      sourceConfigFileId: source.id,
      kind: nextFile.kind,
      rawSecretPersisted: false,
    });
  }

  function handleImportConfigFile(configFileId: string, fileName: string, body: string) {
    const source = agentConfigFiles.find((file) => file.id === configFileId);
    if (!source) {
      return;
    }
    const directoryPrefix = source.path.includes("/")
      ? `${source.path.split("/").slice(0, -1).join("/")}/`
      : "";
    const nextPath = `${directoryPrefix}${fileName}`;
    const nextLabel = fileName.replace(/\.(md|markdown|txt)$/i, "").trim() || source.label;

    setAgentConfigFiles((files) =>
      files.map((file) =>
        file.id === configFileId
          ? {
              ...file,
              body,
              label: nextLabel,
              path: nextPath,
              updatedAt: new Date().toISOString(),
              version: file.version + 1,
            }
          : file,
      ),
    );
    appendEvent("agent.config_file.imported", {
      configFileId,
      fileName,
      kind: source.kind,
      rawSecretPersisted: false,
    });
  }

  function handleSaveConfigFile(configFileId: string) {
    const source = agentConfigFiles.find((file) => file.id === configFileId);
    if (!source) {
      return;
    }
    // CFG-D: 저장 = 체크포인트 기록. 버전을 단조 증가시키고(updatedAt 동반),
    // 이벤트는 같은 payload shape 로 새 버전을 기록한다(필드 불변, 값만 갱신).
    const nextVersion = source.version + 1;
    setAgentConfigFiles((files) =>
      files.map((file) =>
        file.id === configFileId
          ? {
              ...file,
              updatedAt: new Date().toISOString(),
              version: nextVersion,
            }
          : file,
      ),
    );
    appendEvent("agent.config_file.saved", {
      configFileId,
      kind: source.kind,
      label: source.label,
      path: source.path,
      version: nextVersion,
      rawSecretPersisted: false,
    });
  }

  function handleUpdateConfigFile(configFileId: string, patch: Partial<AgentConfigFile>) {
    setAgentConfigFiles((files) =>
      files.map((file) =>
        file.id === configFileId
          ? {
              ...file,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : file,
      ),
    );
  }

  return {
    agentConfigFiles,
    agentProfilePacks,
    handleCreateConfigFile,
    handleDuplicateConfigFile,
    handleImportConfigFile,
    handleSaveConfigFile,
    handleUpdateConfigFile,
    selectedConfigFileId,
    setSelectedConfigFileId,
  };
}
