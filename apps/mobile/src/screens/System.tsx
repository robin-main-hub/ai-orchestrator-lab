import { useState } from "react";
import { seedProviders, seedRuntime } from "../seeds";
import type { MobileProviderEntry, MobileRuntimeSnapshot, RuntimeStatus } from "../types";

const STATUS_LABEL: Record<RuntimeStatus, string> = {
  online: "정상",
  degraded: "지연/일부 기능 제한",
  offline: "연결 끊김",
  syncing: "동기화 중",
  unknown: "확인 안 됨",
};

export function System() {
  const [runtime, setRuntime] = useState<MobileRuntimeSnapshot>(seedRuntime);
  const [probing, setProbing] = useState(false);
  const [lastProbeResult, setLastProbeResult] = useState<string | null>(null);

  const handleProbe = async () => {
    setProbing(true);
    setLastProbeResult(null);
    // 실제 probe — 서버가 죽어 있으면 정직하게 offline. 가짜 200 OK를 위조하지
    // 않는다(이전엔 네트워크 없이 항상 "정상 · 200 OK"를 띄워 실제 상태를 정반대로
    // 오인시켰다).
    const base =
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_DGX_SERVER_BASE_URL ??
      "http://dgx-02:4317";
    const probedAt = new Date().toISOString();
    try {
      const response = await fetch(`${base}/`, { method: "GET" });
      // 401 = 서버는 살아있고 인증만 필요 → online으로 간주
      const reachable = response.ok || response.status === 401;
      setRuntime((r) => ({ ...r, lastProbeAt: probedAt, status: reachable ? "online" : "degraded" }));
      setLastProbeResult(
        `${base} → ${response.status}${response.status === 401 ? " (인증 필요 — 서버 정상)" : ""}`,
      );
    } catch (error) {
      setRuntime((r) => ({ ...r, lastProbeAt: probedAt, status: "offline" }));
      setLastProbeResult(`${base} → 연결 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title">시스템</div>
      </header>
      <div className="screen__body">
        <RuntimeSection runtime={runtime} onProbe={handleProbe} probing={probing} />
        {lastProbeResult ? (
          <section className="section">
            <div className="section__title">최근 진단</div>
            <div className="row">
              <div className="row__label" style={{ fontSize: 13, lineHeight: 1.5 }}>
                {lastProbeResult}
              </div>
            </div>
          </section>
        ) : null}
        <ProvidersSection providers={seedProviders} />
        <BackupSection />
        <IngressSection />
      </div>
    </div>
  );
}

function RuntimeSection({
  runtime,
  onProbe,
  probing,
}: {
  runtime: MobileRuntimeSnapshot;
  onProbe: () => void;
  probing: boolean;
}) {
  return (
    <section className="section">
      <div className="section__title">DGX Runtime</div>
      <div className="row">
        <div className="row__label">상태</div>
        <span className={`chip chip--${runtime.status}`}>{STATUS_LABEL[runtime.status]}</span>
      </div>
      <div className="row">
        <div className="row__label">서버</div>
        <div className="row__value">{runtime.serverEndpoint ?? "-"}</div>
      </div>
      <div className="row">
        <div className="row__label">모델 수</div>
        <div className="row__value">{runtime.modelCount ?? "-"}</div>
      </div>
      <div className="row">
        <div className="row__label">Provider 수</div>
        <div className="row__value">{runtime.providerCount ?? "-"}</div>
      </div>
      <div className="row">
        <div className="row__label">마지막 진단</div>
        <div className="row__value">
          {runtime.lastProbeAt ? new Date(runtime.lastProbeAt).toLocaleString("ko-KR") : "-"}
        </div>
      </div>
      <button
        type="button"
        className="button button--accent"
        onClick={onProbe}
        disabled={probing}
      >
        {probing ? "진단 중..." : "DGX 진단 실행 (Probe)"}
      </button>
    </section>
  );
}

function ProvidersSection({ providers }: { providers: MobileProviderEntry[] }) {
  return (
    <section className="section">
      <div className="section__title">Provider Registry · {providers.length}개</div>
      {providers.map((provider) => (
        <div key={provider.id} className="row">
          <div className="row__label">
            <div style={{ fontWeight: 600 }}>{provider.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              모델 {provider.modelCount}개 · {provider.tags.join(" · ")}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <span className={`chip chip--${provider.trustLevel}`}>{provider.trustLevel}</span>
            <span className={`chip chip--${provider.secretAvailability}`}>
              {provider.secretAvailability === "available"
                ? "키 OK"
                : provider.secretAvailability === "missing"
                  ? "키 없음"
                  : "만료"}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

function BackupSection() {
  return (
    <section className="section">
      <div className="section__title">백업 / Obsidian Export</div>
      <div className="row">
        <div className="row__label">Vault 경로</div>
        <div className="row__value">F:/obsidian/ai-headquarter</div>
      </div>
      <div className="row">
        <div className="row__label">마지막 export</div>
        <div className="row__value">2026-05-25 04:12</div>
      </div>
      <div className="settings__hint">
        export 트리거는 데스크탑 또는 서버 cron에서 실행됩니다. 모바일은 read-only.
      </div>
    </section>
  );
}

function IngressSection() {
  return (
    <section className="section">
      <div className="section__title">Ingress Guard</div>
      <div className="row">
        <div className="row__label">External Ingress receiver</div>
        <span className="chip chip--offline">미연결</span>
      </div>
      <div className="row">
        <div className="row__label">Confidence routing</div>
        <span className="chip chip--unknown">설계 단계</span>
      </div>
      <div className="settings__hint">
        외부 채널은 guard pipeline 통과 후에만 자동 응답됩니다. 자세한 정책은 docs/15.
      </div>
    </section>
  );
}
