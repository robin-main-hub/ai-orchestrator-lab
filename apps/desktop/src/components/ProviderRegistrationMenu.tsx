import { ChevronLeft, KeyRound, LockKeyhole, Pencil, RefreshCw, Terminal, Trash2, type LucideIcon } from "lucide-react";
import type { ModelDiscoverySnapshot, ProviderProfile } from "@ai-orchestrator/protocol";
import type { ModelCatalog, ProviderRegistrationMode, WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";
export function ProviderRegistrationMenu({
  modelCatalog,
  modelDiscoveryByProviderId,
  onClose,
  onDiscoverModels,
  onRemoveProvider,
  onRenameProvider,
  onRegister,
  profiles,
  usedProviderIds,
}: {
  modelCatalog: ModelCatalog;
  modelDiscoveryByProviderId: Record<string, ModelDiscoverySnapshot>;
  onClose: () => void;
  onDiscoverModels: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  onRenameProvider: (providerId: string) => void;
  onRegister: (mode: ProviderRegistrationMode) => void;
  profiles: ProviderProfile[];
  usedProviderIds: Set<string>;
}) {
  const options: Array<{
    mode: ProviderRegistrationMode;
    label: string;
    detail: string;
    icon: LucideIcon;
  }> = [
    { mode: "api_key", label: "API Key", detail: "env / JSON / base URL", icon: KeyRound },
    { mode: "cli", label: "CLI", detail: "Codex / Claude Code / OpenClaw", icon: Terminal },
    { mode: "oauth", label: "OAuth", detail: "session / account binding", icon: LockKeyhole },
  ];
  const auditItems: WindowAuditItem[] = [
    {
      id: "api",
      label: "API Key",
      status: "ready",
      detail: "단순 키, env export, Claude Code JSON, custom base URL을 같은 secret ref로 받습니다.",
    },
    {
      id: "cli",
      label: "CLI Provider",
      status: "partial",
      detail: "Codex/Claude/OpenClaw CLI는 등록 준비됨. Gemini agy -p는 설정 전까지 잠금입니다.",
    },
    {
      id: "oauth",
      label: "OAuth",
      status: "ready",
      detail: "계정 세션형 provider를 이름 붙여 저장하고 agent에서 선택할 수 있습니다.",
    },
    {
      id: "models",
      label: "모델 목록",
      status: profiles.length > 0 ? "ready" : "partial",
      detail: "프로바이더별 discovery/cached 모델을 agent 모델 선택창으로 넘깁니다.",
    },
  ];

  return (
    <section className="provider-registration-menu" aria-label="provider registration menu">
      <header>
        <span>Provider 등록</span>
        <button aria-label="provider 등록 메뉴 닫기" className="rail-icon-button" onClick={onClose} type="button">
          <ChevronLeft size={14} />
        </button>
      </header>
      <div className="provider-registration-actions">
        {options.map((option) => (
          <button key={option.mode} onClick={() => onRegister(option.mode)} type="button">
            <option.icon size={15} />
            <span>{option.label}</span>
            <small>{option.detail}</small>
          </button>
        ))}
      </div>
      <div className="provider-registration-list" aria-label="registered providers">
        {profiles.map((profile) => {
          const isInUse = usedProviderIds.has(profile.id);
          const modelCount = modelCatalog[profile.id]?.length ?? 0;
          const discovery = modelDiscoveryByProviderId[profile.id];
          return (
            <article className={isInUse ? "in-use" : ""} key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <span>
                  {profile.trustLevel} / {modelCount} models / {discovery?.status ?? "cached"}
                </span>
              </div>
              <button
                aria-label={`${profile.name} model discovery`}
                className="rail-icon-button"
                onClick={() => onDiscoverModels(profile.id)}
                title="model discovery"
                type="button"
              >
                <RefreshCw size={13} />
              </button>
              <button
                aria-label={`${profile.name} 이름 변경`}
                className="rail-icon-button"
                onClick={() => onRenameProvider(profile.id)}
                title="provider 이름 변경"
                type="button"
              >
                <Pencil size={13} />
              </button>
              <button
                aria-label={`${profile.name} 삭제`}
                className="rail-icon-button"
                disabled={isInUse || profiles.length <= 1}
                onClick={() => onRemoveProvider(profile.id)}
                title={isInUse ? "agent가 사용 중이라 삭제할 수 없음" : "provider 삭제"}
                type="button"
              >
                <Trash2 size={13} />
              </button>
            </article>
          );
        })}
      </div>
      <WindowChecklist items={auditItems} title="프로바이더 창 점검" />
    </section>
  );
}
