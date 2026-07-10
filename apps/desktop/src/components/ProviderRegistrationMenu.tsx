import { ChevronLeft, KeyRound, LockKeyhole, Pencil, RefreshCw, Terminal, Trash2, type LucideIcon } from "lucide-react";
import type { ModelDiscoverySnapshot, ProviderProfile } from "@ai-orchestrator/protocol";
import type { ProviderRoutingConsoleItem } from "../lib/providerRoutingConsole";
import type { ModelCatalog, ProviderRegistrationMode } from "../types";
export function ProviderRegistrationMenu({
  modelCatalog,
  modelDiscoveryByProviderId,
  onClose,
  onBindDefaultCredential,
  onDiscoverModels,
  onRemoveProvider,
  onRenameProvider,
  onRegister,
  profiles,
  routingConsoleItems,
  defaultCredentialProviderIds = new Set(),
  usedProviderIds,
}: {
  modelCatalog: ModelCatalog;
  modelDiscoveryByProviderId: Record<string, ModelDiscoverySnapshot>;
  onClose: () => void;
  onBindDefaultCredential: (providerId: string) => void;
  onDiscoverModels: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  onRenameProvider: (providerId: string) => void;
  onRegister: (mode: ProviderRegistrationMode) => void;
  profiles: ProviderProfile[];
  routingConsoleItems: ProviderRoutingConsoleItem[];
  defaultCredentialProviderIds?: Set<string>;
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
    { mode: "oauth", label: "OAuth", detail: "세션 / 계정 바인딩", icon: LockKeyhole },
  ];

  return (
    <section className="provider-registration-menu" aria-label="공급자 등록 메뉴">
      <header>
        <span>공급자 등록</span>
        <button aria-label="공급자 등록 메뉴 닫기" className="mgmt-icon-button" onClick={onClose} type="button">
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
          const routingItem = routingConsoleItems.find((item) => item.providerId === profile.id);
          return (
            <article className={isInUse ? "in-use" : ""} key={profile.id}>
              <div>
                <strong>{routingItem?.displayName ?? profile.name}</strong>
                <span>
                  {routingItem
                    ? `${routingItem.trustLabel} / 모델 ${routingItem.modelCount}개 / ${routingItem.discoveryLabel}`
                    : `${profile.trustLevel} / 모델 ${modelCount}개 / ${discovery?.status ?? "캐시됨"}`}
                </span>
                <span>
                  {routingItem
                    ? `에이전트 ${routingItem.assignedAgentCount}명 / ${routingItem.readinessLabel} / ${routingItem.secretPolicyLabel}`
                    : "라우팅 요약 대기"}
                </span>
                {defaultCredentialProviderIds.has(profile.id) ? <span>기본 API 키 준비 / 직접 호출 가능</span> : null}
              </div>
              <button
                aria-label={`${profile.name} 모델 확인`}
                className="mgmt-icon-button"
                onClick={() => onDiscoverModels(profile.id)}
                title="모델 확인"
                type="button"
              >
                <RefreshCw size={13} />
              </button>
              <button
                aria-label={`${profile.name} 기본 API 키 연결`}
                className="mgmt-icon-button"
                onClick={() => onBindDefaultCredential(profile.id)}
                title="기본 API 키 연결"
                type="button"
              >
                <KeyRound size={13} />
              </button>
              <button
                aria-label={`${profile.name} 이름 변경`}
                className="mgmt-icon-button"
                onClick={() => onRenameProvider(profile.id)}
                title="공급자 이름 변경"
                type="button"
              >
                <Pencil size={13} />
              </button>
              <button
                aria-label={`${profile.name} 삭제`}
                className="mgmt-icon-button"
                disabled={isInUse || profiles.length <= 1}
                onClick={() => onRemoveProvider(profile.id)}
                title={isInUse ? "에이전트가 사용 중이라 삭제할 수 없음" : "공급자 삭제"}
                type="button"
              >
                <Trash2 size={13} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
