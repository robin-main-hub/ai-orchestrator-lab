import { CopyPlus, Download, FileText, Package, Plus, Save, Upload } from "lucide-react";
import { PersonaAvatarStack } from "@/components/persona/PersonaChip";
import { agentRoleLabel } from "../lib/helpers";
import { platformDownload } from "../lib/platform";
import type {
  AgentConfigFile,
  AgentConfigFileKind,
  AgentProfilePack,
  AgentVisualSettings,
  WorkbenchAgent,
} from "../types";

const configKinds: AgentConfigFileKind[] = ["soul", "agents", "skill", "memory_policy", "prompt_template"];

const kindLabels: Record<AgentConfigFileKind, string> = {
  agents: "AGENTS.md",
  memory_policy: "기억 정책",
  prompt_template: "프롬프트 템플릿",
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

/**
 * 파일을 "입고 있는" 캐릭터들 — linkedAgentIds → agents 로 해석해 PersonaChip
 * 프리미티브가 쓰는 member 형태로 반환한다. 신원 없는 id(삭제된 에이전트 등)는
 * 조용히 제외해 가짜 배정을 만들지 않는다(§1.2 rule 4).
 */
function linkedMembers(file: AgentConfigFile, agents: WorkbenchAgent[]) {
  return file.linkedAgentIds
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent): agent is WorkbenchAgent => Boolean(agent))
    .map((agent) => ({ personaName: agent.personaName, role: agent.role, name: agent.name }));
}

export function ConfigLibraryPanel({
  agents = [],
  // agentVisualsById is accepted (wired from App) so PR② (CFG-C persona edit
  // row) can render user-uploaded avatars without re-touching App.tsx. PR①
  // resolves character portraits via role slug (all linked roles ship art),
  // so the stack shows real art without needing the uploaded-visual fallback.
  configFiles,
  onCreateConfigFile,
  onDuplicateConfigFile,
  onImportConfigFile,
  onSaveConfigFile,
  onSelectConfigFile,
  onUpdateConfigFile,
  profilePacks,
  variant = "workbench",
  selectedConfigFileId,
}: {
  agents?: WorkbenchAgent[];
  agentVisualsById?: Record<string, AgentVisualSettings>;
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
  const selectedMembers = selectedConfigFile ? linkedMembers(selectedConfigFile, agents) : [];
  const STATUS_TOOLTIP =
    "이 항목은 앱 내장 라이브러리입니다. 위 경로는 논리적 표시이며 디스크의 실제 파일을 읽거나 쓰지 않습니다. 저장은 이벤트 기록만 남기고 파일에 반영되지 않습니다(새로고침 시 초기값으로 복원). 실제 파일은 불러오기/다운로드로 로컬 Markdown과 주고받습니다.";

  return (
    <section className={`config-v2 config-v2--${variant}`} aria-label="에이전트 설정파일 라이브러리">
      <header className="config-v2__header" style={{ gridArea: "header" }}>
        <div className="config-v2__heading">
          <FileText size={16} />
          <div>
            <strong>설정파일</strong>
            <span>에이전트 지침 라이브러리</span>
          </div>
        </div>

        <div className="config-v2__kinds" role="tablist" aria-label="설정파일 종류">
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

        <div className="config-v2__header-actions">
          <span className="config-v2__status-badge" title={STATUS_TOOLTIP}>
            앱 내장 · 디스크 미반영
          </span>
          <button
            className="config-v2__new-button"
            onClick={() => onCreateConfigFile(selectedKind)}
            title="현재 종류로 새 설정파일 만들기"
            type="button"
          >
            <Plus size={14} />
            새로 만들기
          </button>
        </div>
      </header>

      <div className="config-v2__list" aria-label="설정파일 목록" style={{ gridArea: "list" }}>
        {visibleFiles.map((file) => {
          const members = linkedMembers(file, agents);
          return (
            <button
              className={file.id === selectedConfigFile?.id ? "active" : ""}
              key={file.id}
              onClick={() => onSelectConfigFile(file.id)}
              type="button"
            >
              <span className="config-v2__list-top">
                <strong>{file.label}</strong>
                {members.length > 0 ? (
                  <PersonaAvatarStack members={members} size={20} max={4} />
                ) : (
                  <em className="config-v2__unworn">미착용</em>
                )}
              </span>
              <span className="config-v2__list-meta">
                {scopeLabel(file.scope)} · <span className="aol-mono">v{file.version}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedConfigFile ? (
        <div className="config-v2__editor" style={{ gridArea: "editor" }}>
          <div className="config-v2__toolbar">
            <span className="config-v2__toolbar-kind">{kindLabels[selectedConfigFile.kind]}</span>
            <div className="config-v2__toolbar-spacer" />
            <button
              className="config-v2__icon-button"
              onClick={() => onDuplicateConfigFile(selectedConfigFile.id)}
              title="복제"
              type="button"
            >
              <CopyPlus size={14} />
            </button>
            <button
              className="config-v2__icon-button"
              onClick={() => onSaveConfigFile(selectedConfigFile.id)}
              title="체크포인트 기록"
              type="button"
            >
              <Save size={14} />
            </button>
            <label className="config-v2__icon-button config-v2__upload" title="Markdown 파일 불러오기">
              <Upload size={14} />
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
              className="config-v2__icon-button"
              onClick={() => downloadConfigFile(selectedConfigFile)}
              title="Markdown 파일 다운로드"
              type="button"
            >
              <Download size={14} />
            </button>
          </div>

          <div className="config-v2__wearers">
            <span className="config-v2__wearers-label">착용 에이전트</span>
            {selectedMembers.length > 0 ? (
              <PersonaAvatarStack members={selectedMembers} size={24} max={4} />
            ) : (
              <em className="config-v2__unworn">미착용</em>
            )}
          </div>

          <label className="config-v2__field config-v2__field--label">
            <span>라벨</span>
            <input
              value={selectedConfigFile.label}
              onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { label: event.target.value })}
            />
          </label>

          <label className="config-v2__field config-v2__field--body">
            <span>본문</span>
            <textarea
              value={selectedConfigFile.body}
              onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { body: event.target.value })}
            />
          </label>

          <details className="config-v2__meta">
            <summary>경로 · 범위 · 버전 · 태그</summary>
            <div className="config-v2__meta-grid">
              <label className="config-v2__field config-v2__field--path">
                <span>논리 경로</span>
                <input
                  className="aol-mono"
                  value={selectedConfigFile.path}
                  onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { path: event.target.value })}
                />
              </label>
              <label className="config-v2__field">
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
              <label className="config-v2__field">
                <span>버전</span>
                <input
                  className="aol-mono"
                  min={1}
                  type="number"
                  value={selectedConfigFile.version}
                  onChange={(event) =>
                    onUpdateConfigFile(selectedConfigFile.id, { version: Math.max(1, Number(event.target.value) || 1) })
                  }
                />
              </label>
              <label className="config-v2__field config-v2__field--tags">
                <span>태그</span>
                <input
                  value={tagInputValue(selectedConfigFile.tags)}
                  onChange={(event) => onUpdateConfigFile(selectedConfigFile.id, { tags: parseTagInput(event.target.value) })}
                />
              </label>
            </div>
          </details>
        </div>
      ) : (
        <div className="config-v2__editor config-v2__editor--empty" style={{ gridArea: "editor" }}>
          <p>이 종류의 설정파일이 없습니다. 새로 만들기로 첫 파일을 추가하세요.</p>
        </div>
      )}

      <div className="config-v2__feed" style={{ gridArea: "feed" }}>
        <div className="config-v2__section-title">
          <Package size={14} />
          <strong>프로필 팩</strong>
        </div>
        <div className="config-v2__packs">
          {profilePacks.map((pack) => (
            <article className="config-v2__pack" key={pack.id}>
              <strong>{pack.label}</strong>
              <span>{agentRoleLabel(pack.agentRole)} / 설정파일 {pack.configFileIds.length}개</span>
              <p>{pack.description}</p>
              <em>{pack.tags.join(" · ")}</em>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
