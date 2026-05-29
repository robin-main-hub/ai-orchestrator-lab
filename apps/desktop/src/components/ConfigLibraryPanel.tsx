import { CheckCircle2, CopyPlus, Download, FileText, Package, Plus, Save, Tags, Upload } from "lucide-react";
import { platformDownload } from "../lib/platform";
import type { AgentConfigFile, AgentConfigFileKind, AgentProfilePack } from "../types";

const configKinds: AgentConfigFileKind[] = ["soul", "agents", "skill", "memory_policy", "prompt_template"];

const kindLabels: Record<AgentConfigFileKind, string> = {
  agents: "AGENTS.md",
  memory_policy: "Memory Policy",
  prompt_template: "Prompt Template",
  skill: "SKILL.md",
  soul: "SOUL.md",
};

function scopeLabel(scope: AgentConfigFile["scope"]) {
  const labels: Record<AgentConfigFile["scope"], string> = {
    agent: "에이전트",
    global: "전역",
    project: "프로젝트",
  };

  return labels[scope];
}

function tagInputValue(tags: string[]) {
  return tags.join(", ");
}

function parseTagInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function downloadConfigFile(file: AgentConfigFile) {
  const fileName = file.path.split(/[\\/]/).filter(Boolean).pop() ?? `${file.label}.md`;
  platformDownload.downloadTextFile({
    fileName,
    body: file.body,
    mimeType: "text/markdown;charset=utf-8",
  });
}

export function ConfigLibraryPanel({
  configFiles,
  onCreateConfigFile,
  onDuplicateConfigFile,
  onImportConfigFile,
  onSaveConfigFile,
  onSelectConfigFile,
  onUpdateConfigFile,
  profilePacks,
  variant = "rail",
  selectedConfigFileId,
}: {
  configFiles: AgentConfigFile[];
  onCreateConfigFile: (kind: AgentConfigFileKind) => void;
  onDuplicateConfigFile: (configFileId: string) => void;
  onImportConfigFile: (configFileId: string, fileName: string, body: string) => void;
  onSaveConfigFile: (configFileId: string) => void;
  onSelectConfigFile: (configFileId: string) => void;
  onUpdateConfigFile: (configFileId: string, patch: Partial<AgentConfigFile>) => void;
  profilePacks: AgentProfilePack[];
  variant?: "rail" | "workbench";
  selectedConfigFileId?: string;
}) {
  const selectedConfigFile = configFiles.find((file) => file.id === selectedConfigFileId) ?? configFiles[0];
  const selectedKind = selectedConfigFile?.kind ?? "soul";
  const visibleFiles = configFiles.filter((file) => file.kind === selectedKind);

  return (
    <section
      className={`mini-panel config-library-panel ${variant === "rail" ? "rail-panel" : "config-library-workbench"}`}
      aria-label="agent config file library"
    >
      <header>
        <FileText size={16} />
        <span>설정파일</span>
        <button
          className="rail-icon-button"
          onClick={() => onCreateConfigFile(selectedKind)}
          title="현재 종류로 새 설정파일 만들기"
          type="button"
        >
          <Plus size={13} />
        </button>
      </header>

      <div className="config-kind-tabs" role="tablist" aria-label="설정파일 종류">
        {configKinds.map((kind) => {
          const isActive = kind === selectedKind;
          const count = configFiles.filter((file) => file.kind === kind).length;
          return (
            <button
              aria-selected={isActive}
              className={isActive ? "active" : ""}
              key={kind}
              onClick={() => {
                const firstOfKind = configFiles.find((file) => file.kind === kind);
                if (firstOfKind) {
                  onSelectConfigFile(firstOfKind.id);
                  return;
                }
                onCreateConfigFile(kind);
              }}
              role="tab"
              type="button"
            >
              <span>{kindLabels[kind]}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>

      <div className="config-library-body">
        <div className="config-file-list" aria-label="설정파일 목록">
          {visibleFiles.map((file) => (
            <button
              className={file.id === selectedConfigFile?.id ? "active" : ""}
              key={file.id}
              onClick={() => onSelectConfigFile(file.id)}
              type="button"
            >
              <strong>{file.label}</strong>
              <span>{scopeLabel(file.scope)} / v{file.version} / {file.path}</span>
              <em>{file.tags.join(" · ") || "no tag"}</em>
            </button>
          ))}
        </div>

        {selectedConfigFile ? (
          <div className="config-file-editor">
            <div className="config-editor-toolbar">
              <span>{kindLabels[selectedConfigFile.kind]}</span>
              <button
                className="rail-icon-button"
                onClick={() => onDuplicateConfigFile(selectedConfigFile.id)}
                title="복제"
                type="button"
              >
                <CopyPlus size={13} />
              </button>
              <button
                className="rail-icon-button"
                onClick={() => onSaveConfigFile(selectedConfigFile.id)}
                title="저장"
                type="button"
              >
                <Save size={13} />
              </button>
              <label className="rail-icon-button config-file-toolbar-label" title="Markdown 파일 불러오기">
                <Upload size={13} />
                <input
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) {
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        onImportConfigFile(selectedConfigFile.id, file.name, reader.result);
                      }
                    };
                    reader.readAsText(file);
                    event.currentTarget.value = "";
                  }}
                  type="file"
                />
              </label>
              <button
                className="rail-icon-button"
                onClick={() => downloadConfigFile(selectedConfigFile)}
                title="Markdown 파일 다운로드"
                type="button"
              >
                <Download size={13} />
              </button>
            </div>
            <label>
              <span>라벨</span>
              <input
                value={selectedConfigFile.label}
                onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { label: event.target.value })}
              />
            </label>
            <label>
              <span>경로</span>
              <input
                value={selectedConfigFile.path}
                onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { path: event.target.value })}
              />
            </label>
            <div className="config-editor-grid">
              <label>
                <span>범위</span>
                <select
                  value={selectedConfigFile.scope}
                  onChange={(event) =>
                    onUpdateConfigFile(selectedConfigFile.id, { scope: event.target.value as AgentConfigFile["scope"] })
                  }
                >
                  <option value="agent">에이전트</option>
                  <option value="project">프로젝트</option>
                  <option value="global">전역</option>
                </select>
              </label>
              <label>
                <span>버전</span>
                <input
                  min={1}
                  type="number"
                  value={selectedConfigFile.version}
                  onChange={(event) =>
                    onUpdateConfigFile(selectedConfigFile.id, { version: Math.max(1, Number(event.target.value) || 1) })
                  }
                />
              </label>
            </div>
            <label>
              <span>태그</span>
              <input
                value={tagInputValue(selectedConfigFile.tags)}
                onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { tags: parseTagInput(event.target.value) })}
              />
            </label>
            <label>
              <span>본문</span>
              <textarea
                value={selectedConfigFile.body}
                onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { body: event.target.value })}
              />
            </label>
            <div className="config-save-note">
              <Save size={13} />
              <span>저장은 Event Storage 이벤트로 남기고, 불러오기/다운로드는 로컬 Markdown 파일로 바로 처리합니다.</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="config-profile-pack-list">
        <div className="config-section-title">
          <Package size={14} />
          <strong>Profile Packs</strong>
        </div>
        {profilePacks.map((pack) => (
          <article key={pack.id}>
            <div>
              <strong>{pack.label}</strong>
              <span>{pack.agentRole} / {pack.configFileIds.length} files</span>
              <p>{pack.description}</p>
            </div>
            <em>{pack.tags.join(" · ")}</em>
          </article>
        ))}
      </div>

      <div className="config-rule-strip">
        <span>
          <CheckCircle2 size={13} />
          SOUL.md와 AGENTS.md는 충돌하지 않게 종류별 하나만 선택
        </span>
        <span>
          <Tags size={13} />
          라벨, 태그, 버전으로 같은 파일의 변형을 구분
        </span>
      </div>

    </section>
  );
}
