import { useEffect, useState } from "react";
import { CopyPlus, Download, FileText, Package, Plus, Save, Upload } from "lucide-react";
import { PersonaAvatarStack, PersonaChip } from "@/components/persona/PersonaChip";
import { AgentPickButton, ConfigLinkedAgentsRow } from "./config/ConfigLinkedAgentsRow";
import { ConfigActivityFeed } from "./config/ConfigActivityFeed";
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
  // agentVisualsById is accepted (wired from App) so persona rows can later
  // render user-uploaded avatars without re-touching App.tsx. Portraits are
  // resolved via role slug (all linked roles ship art), so the stack shows
  // real art without needing the uploaded-visual fallback.
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
  // CFG-D: 탭 클릭 = 탐색만. 선택 파일과 무관하게 빈 종류도 열람할 수 있도록
  // 뷰 종류를 로컬 상태로 분리한다(빈 종류 = 빈 상태 + CTA, 생성 부수효과 없음).
  const [activeKind, setActiveKind] = useState<AgentConfigFileKind | null>(null);
  const viewKind = activeKind ?? selectedConfigFile?.kind ?? "soul";
  const visibleFiles = configFiles.filter((file) => file.kind === viewKind);
  const editorFile =
    selectedConfigFile && selectedConfigFile.kind === viewKind ? selectedConfigFile : visibleFiles[0];

  // CFG-D: 체크포인트 피드백(U19 success 톤 — accent, 6초 자동 소거).
  const [checkpointNotice, setCheckpointNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!checkpointNotice) {
      return;
    }
    const timer = window.setTimeout(() => setCheckpointNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [checkpointNotice]);

  const STATUS_TOOLTIP =
    "이 항목은 앱 내장 라이브러리입니다. 위 경로는 논리적 표시이며 디스크의 실제 파일을 읽거나 쓰지 않습니다. 저장은 이벤트 기록만 남기고 파일에 반영되지 않습니다(새로고침 시 초기값으로 복원). 실제 파일은 불러오기/다운로드로 로컬 Markdown과 주고받습니다.";

  function applyProfilePack(pack: AgentProfilePack, agent: WorkbenchAgent) {
    // CFG-E: 팩 적용 = 팩의 각 파일 linkedAgentIds 에 선택 에이전트 추가.
    // 기존 onUpdateConfigFile 만 사용(신규 App 배선 없음). 이미 착용 중이면 무변.
    for (const configFileId of pack.configFileIds) {
      const file = configFiles.find((candidate) => candidate.id === configFileId);
      if (!file || file.linkedAgentIds.includes(agent.id)) {
        continue;
      }
      onUpdateConfigFile(file.id, { linkedAgentIds: [...file.linkedAgentIds, agent.id] });
    }
  }

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
            const isActive = kind === viewKind;
            const count = configFiles.filter((file) => file.kind === kind).length;
            return (
              <button
                aria-selected={isActive}
                className={isActive ? "active" : ""}
                key={kind}
                onClick={() => {
                  // CFG-D: 탐색만 수행한다 — 빈 종류에서도 파일을 만들지 않는다.
                  setActiveKind(kind);
                  const firstOfKind = configFiles.find((file) => file.kind === kind);
                  if (firstOfKind) {
                    onSelectConfigFile(firstOfKind.id);
                  }
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
            onClick={() => onCreateConfigFile(viewKind)}
            title="현재 종류로 새 설정파일 만들기"
            type="button"
          >
            <Plus size={14} />
            새로 만들기
          </button>
        </div>
      </header>

      {visibleFiles.length === 0 ? (
        <div className="config-v2__empty">
          <strong>{kindLabels[viewKind]} 파일이 없습니다</strong>
          <span>탭은 탐색만 합니다. 첫 파일은 직접 만들어 시작하세요.</span>
          <button
            className="config-v2__empty-cta"
            onClick={() => onCreateConfigFile(viewKind)}
            type="button"
          >
            <Plus size={14} />새 {kindLabels[viewKind]} 만들기
          </button>
        </div>
      ) : (
        <>
          <div className="config-v2__list" aria-label="설정파일 목록" style={{ gridArea: "list" }}>
            {visibleFiles.map((file) => {
              const members = linkedMembers(file, agents);
              return (
                <button
                  className={file.id === editorFile?.id ? "active" : ""}
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

          {editorFile ? (
            <div className="config-v2__editor" style={{ gridArea: "editor" }}>
              <div className="config-v2__toolbar">
                <span className="config-v2__toolbar-kind">{kindLabels[editorFile.kind]}</span>
                <div className="config-v2__toolbar-spacer" />
                <button
                  className="config-v2__icon-button"
                  onClick={() => onDuplicateConfigFile(editorFile.id)}
                  title="복제"
                  type="button"
                >
                  <CopyPlus size={14} />
                </button>
                <button
                  className="config-v2__icon-button"
                  onClick={() => {
                    onSaveConfigFile(editorFile.id);
                    setCheckpointNotice(`체크포인트 기록됨 · v${editorFile.version + 1}`);
                  }}
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
                          onImportConfigFile(editorFile.id, file.name, reader.result);
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
                  onClick={() => downloadConfigFile(editorFile)}
                  title="Markdown 파일 다운로드"
                  type="button"
                >
                  <Download size={14} />
                </button>
              </div>

              {checkpointNotice ? (
                <p className="config-v2__notice" role="status">
                  {checkpointNotice}
                </p>
              ) : null}

              <ConfigLinkedAgentsRow
                agents={agents}
                linkedAgentIds={editorFile.linkedAgentIds}
                onChange={(nextLinkedAgentIds) =>
                  onUpdateConfigFile(editorFile.id, { linkedAgentIds: nextLinkedAgentIds })
                }
              />

              <label className="config-v2__field config-v2__field--label">
                <span>라벨</span>
                <input
                  value={editorFile.label}
                  onChange={(event) => onUpdateConfigFile(editorFile.id, { label: event.target.value })}
                />
              </label>

              <label className="config-v2__field config-v2__field--body">
                <span>본문</span>
                <textarea
                  value={editorFile.body}
                  onChange={(event) => onUpdateConfigFile(editorFile.id, { body: event.target.value })}
                />
              </label>

              <details className="config-v2__meta">
                <summary>경로 · 범위 · 버전 · 태그</summary>
                <div className="config-v2__meta-grid">
                  <label className="config-v2__field config-v2__field--path">
                    <span>논리 경로</span>
                    <input
                      className="aol-mono"
                      value={editorFile.path}
                      onChange={(event) => onUpdateConfigFile(editorFile.id, { path: event.target.value })}
                    />
                  </label>
                  <label className="config-v2__field">
                    <span>범위</span>
                    <select
                      value={editorFile.scope}
                      onChange={(event) =>
                        onUpdateConfigFile(editorFile.id, { scope: event.target.value as AgentConfigFile["scope"] })
                      }
                    >
                      <option value="agent">에이전트</option>
                      <option value="project">프로젝트</option>
                      <option value="global">전역</option>
                    </select>
                  </label>
                  <div className="config-v2__field">
                    <span>버전</span>
                    <span
                      className="config-v2__version aol-mono"
                      title="버전은 체크포인트 기록·불러오기 시 자동으로 증가합니다"
                    >
                      v{editorFile.version}
                    </span>
                  </div>
                  <label className="config-v2__field config-v2__field--tags">
                    <span>태그</span>
                    <input
                      value={tagInputValue(editorFile.tags)}
                      onChange={(event) => onUpdateConfigFile(editorFile.id, { tags: parseTagInput(event.target.value) })}
                    />
                  </label>
                </div>
              </details>
            </div>
          ) : null}
        </>
      )}

      <div className="config-v2__feed" style={{ gridArea: "feed" }}>
        <ConfigActivityFeed configFiles={configFiles} agents={agents} />
        <div className="config-v2__packs-block">
          <div className="config-v2__section-title">
            <Package size={14} />
            <strong>프로필 팩</strong>
          </div>
          <div className="config-v2__packs">
            {profilePacks.map((pack) => (
              <article className="config-v2__pack" key={pack.id}>
                <div className="config-v2__pack-head">
                  <PersonaChip role={pack.agentRole} size={24} showName={false} />
                  <strong>{pack.label}</strong>
                  <AgentPickButton
                    agents={agents}
                    onPick={(agent) => applyProfilePack(pack, agent)}
                    buttonLabel="적용"
                    buttonTitle={`팩 적용: ${pack.label}`}
                    buttonClassName="config-v2__apply-button"
                    emptyLabel="적용할 에이전트가 없습니다"
                  />
                </div>
                <span>{agentRoleLabel(pack.agentRole)} / 설정파일 {pack.configFileIds.length}개</span>
                <p>{pack.description}</p>
                <em>{pack.tags.join(" · ")}</em>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
