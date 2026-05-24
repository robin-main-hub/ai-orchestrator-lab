import { useState } from "react";
import type { MobileMoreScreen } from "../types";
import {
  seedCodingPackets,
  seedDebates,
  seedHandoffs,
  seedMemory,
} from "../seeds";

type Props = {
  onSignOut: () => void;
};

export function More({ onSignOut }: Props) {
  const [screen, setScreen] = useState<MobileMoreScreen>("menu");

  if (screen === "memory") return <MemoryList onBack={() => setScreen("menu")} />;
  if (screen === "packets") return <PacketList onBack={() => setScreen("menu")} />;
  if (screen === "debates") return <DebateList onBack={() => setScreen("menu")} />;
  if (screen === "handoffs") return <HandoffList onBack={() => setScreen("menu")} />;
  if (screen === "settings-general") return <GeneralSettings onBack={() => setScreen("menu")} />;
  if (screen === "settings-connection") return <ConnectionSettings onBack={() => setScreen("menu")} />;

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title">더보기</div>
      </header>
      <div className="screen__body">
        <section className="section">
          <div className="section__title">작업</div>
          <NavRow label="메모리 조회" onClick={() => setScreen("memory")} />
          <NavRow label="코딩 패킷" onClick={() => setScreen("packets")} />
          <NavRow label="토론 결과" onClick={() => setScreen("debates")} />
          <NavRow label="핸드오프" onClick={() => setScreen("handoffs")} />
        </section>
        <section className="section">
          <div className="section__title">설정</div>
          <NavRow label="일반" onClick={() => setScreen("settings-general")} />
          <NavRow label="연결 (토큰·서버)" onClick={() => setScreen("settings-connection")} />
        </section>
        <section className="section">
          <button type="button" className="button button--danger" onClick={onSignOut}>
            로그아웃
          </button>
        </section>
      </div>
    </div>
  );
}

function NavRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="row row--button" onClick={onClick}>
      <div className="row__label">{label}</div>
      <span className="row__chevron" aria-hidden>
        ›
      </span>
    </button>
  );
}

function MemoryList({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = seedMemory.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.excerpt.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="screen__title">메모리</div>
      </header>
      <div className="screen__body">
        <section className="section">
          <input
            type="search"
            placeholder="메모리 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              background: "var(--bg-input)",
              padding: "10px 14px",
              borderRadius: 12,
              fontSize: 16,
              color: "var(--text)",
            }}
          />
        </section>
        {filtered.length === 0 ? (
          <div className="screen__empty">결과가 없습니다.</div>
        ) : (
          filtered.map((item) => (
            <section key={item.id} className="section">
              <div className="row">
                <div className="row__label" style={{ fontWeight: 600 }}>
                  {item.title}
                </div>
                <span className={`chip chip--${item.trustLevel}`}>{item.trustLevel}</span>
              </div>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{item.excerpt}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {item.sourceChannel} · {new Date(item.createdAt).toLocaleDateString("ko-KR")}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function PacketList({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="screen__title">코딩 패킷</div>
      </header>
      <div className="screen__body">
        {seedCodingPackets.map((packet) => (
          <section key={packet.id} className="section">
            <div className="row">
              <div className="row__label" style={{ fontWeight: 600 }}>
                {packet.goal}
              </div>
              <span className={`chip chip--${packet.status === "ready" ? "trusted" : "unknown"}`}>
                {packet.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              검토 파일 {packet.filesToInspect.length}개
            </div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-muted)" }}>
              {packet.filesToInspect.slice(0, 3).join("\n")}
              {packet.filesToInspect.length > 3 ? "\n..." : ""}
            </div>
          </section>
        ))}
        <div className="settings__hint" style={{ textAlign: "center" }}>
          모바일은 read-only. 패킷 실행 승인은 데스크탑 또는 모바일 승인 대시보드 (예정).
        </div>
      </div>
    </div>
  );
}

function DebateList({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="screen__title">토론</div>
      </header>
      <div className="screen__body">
        {seedDebates.map((debate) => (
          <section key={debate.id} className="section">
            <div className="row">
              <div className="row__label" style={{ fontWeight: 600 }}>
                {debate.debateTitle}
              </div>
              <span className={`chip chip--${debate.status === "completed" ? "trusted" : "unknown"}`}>
                {debate.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {debate.kind} · 발언 {debate.utteranceCount}개
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function HandoffList({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="screen__title">핸드오프</div>
      </header>
      <div className="screen__body">
        {seedHandoffs.map((h) => (
          <section key={h.id} className="section">
            <div className="row">
              <div className="row__label" style={{ fontWeight: 600 }}>
                {h.title}
              </div>
              <span className={`chip chip--${h.status === "accepted" ? "trusted" : "unknown"}`}>
                {h.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {h.fromAgent} → {h.toAgent} · {new Date(h.createdAt).toLocaleString("ko-KR")}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const GENERAL_STORAGE = "mobile.settings.general";
type GeneralSettingsValue = {
  theme: "system" | "dark" | "light";
  fontScale: "small" | "default" | "large";
  hapticsEnabled: boolean;
};
const GENERAL_DEFAULT: GeneralSettingsValue = {
  theme: "dark",
  fontScale: "default",
  hapticsEnabled: true,
};

function GeneralSettings({ onBack }: { onBack: () => void }) {
  const [value, setValue] = useState<GeneralSettingsValue>(() => {
    if (typeof localStorage === "undefined") return GENERAL_DEFAULT;
    const raw = localStorage.getItem(GENERAL_STORAGE);
    if (!raw) return GENERAL_DEFAULT;
    try {
      return { ...GENERAL_DEFAULT, ...(JSON.parse(raw) as Partial<GeneralSettingsValue>) };
    } catch {
      return GENERAL_DEFAULT;
    }
  });

  const update = <K extends keyof GeneralSettingsValue>(key: K, v: GeneralSettingsValue[K]) => {
    const next = { ...value, [key]: v };
    setValue(next);
    try {
      localStorage.setItem(GENERAL_STORAGE, JSON.stringify(next));
    } catch (err) {
      console.warn("[mobile] failed to persist general settings", err);
    }
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="screen__title">일반</div>
      </header>
      <div className="screen__body">
        <section className="section">
          <div className="section__title">테마</div>
          <ChoiceRow
            options={[
              { value: "system", label: "시스템" },
              { value: "dark", label: "다크" },
              { value: "light", label: "라이트" },
            ]}
            value={value.theme}
            onChange={(v) => update("theme", v as GeneralSettingsValue["theme"])}
          />
          <div className="settings__hint">현재 라이트 모드는 향후 PR에서 추가됩니다.</div>
        </section>
        <section className="section">
          <div className="section__title">글자 크기</div>
          <ChoiceRow
            options={[
              { value: "small", label: "작게" },
              { value: "default", label: "기본" },
              { value: "large", label: "크게" },
            ]}
            value={value.fontScale}
            onChange={(v) => update("fontScale", v as GeneralSettingsValue["fontScale"])}
          />
        </section>
        <section className="section">
          <div className="section__title">햅틱</div>
          <button
            type="button"
            className="row row--button"
            onClick={() => update("hapticsEnabled", !value.hapticsEnabled)}
          >
            <div className="row__label">메시지 전송 시 진동</div>
            <span className={`chip chip--${value.hapticsEnabled ? "trusted" : "unknown"}`}>
              {value.hapticsEnabled ? "켜짐" : "꺼짐"}
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}

const CONNECTION_STORAGE = "mobile.settings.connection";
type ConnectionSettingsValue = {
  baseUrlPrimary: string;
  baseUrlFallback: string;
  apiToken: string;
};
const CONNECTION_DEFAULT: ConnectionSettingsValue = {
  baseUrlPrimary: "https://orchestrator.endruin.com",
  baseUrlFallback: "http://dgx-02:4317",
  apiToken: "",
};

function ConnectionSettings({ onBack }: { onBack: () => void }) {
  const [value, setValue] = useState<ConnectionSettingsValue>(() => {
    if (typeof localStorage === "undefined") return CONNECTION_DEFAULT;
    const raw = localStorage.getItem(CONNECTION_STORAGE);
    if (!raw) return CONNECTION_DEFAULT;
    try {
      return { ...CONNECTION_DEFAULT, ...(JSON.parse(raw) as Partial<ConnectionSettingsValue>) };
    } catch {
      return CONNECTION_DEFAULT;
    }
  });
  const [showToken, setShowToken] = useState(false);

  const update = <K extends keyof ConnectionSettingsValue>(key: K, v: ConnectionSettingsValue[K]) => {
    const next = { ...value, [key]: v };
    setValue(next);
    try {
      localStorage.setItem(CONNECTION_STORAGE, JSON.stringify(next));
    } catch (err) {
      console.warn("[mobile] failed to persist connection settings", err);
    }
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="screen__title">연결</div>
      </header>
      <div className="screen__body">
        <section className="section">
          <div className="section__title">서버 URL</div>
          <LabeledInput
            label="Primary (Cloudflare)"
            value={value.baseUrlPrimary}
            onChange={(v) => update("baseUrlPrimary", v)}
            placeholder="https://orchestrator.endruin.com"
            type="url"
          />
          <LabeledInput
            label="Fallback (LAN)"
            value={value.baseUrlFallback}
            onChange={(v) => update("baseUrlFallback", v)}
            placeholder="http://dgx-02:4317"
            type="url"
          />
          <div className="settings__hint">
            Primary가 응답 안 하면 Fallback으로 자동 시도. 둘 다 실패하면 진단 메시지 표시.
          </div>
        </section>
        <section className="section">
          <div className="section__title">API 토큰</div>
          <LabeledInput
            label="Bearer Token"
            value={value.apiToken}
            onChange={(v) => update("apiToken", v)}
            placeholder="VITE_ORCHESTRATOR_API_TOKEN 값"
            type={showToken ? "text" : "password"}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <button
            type="button"
            className="button"
            onClick={() => setShowToken((s) => !s)}
          >
            {showToken ? "토큰 숨기기" : "토큰 보기"}
          </button>
          <div className="settings__hint">
            토큰은 기기 안에만 저장되며 cloud sync되지 않습니다. 분실 시 DGX-02 .env의 새
            토큰으로 교체하세요.
          </div>
        </section>
        <section className="section">
          <button
            type="button"
            className="button button--danger"
            onClick={() => {
              setValue(CONNECTION_DEFAULT);
              localStorage.removeItem(CONNECTION_STORAGE);
            }}
          >
            기본값으로 초기화
          </button>
        </section>
      </div>
    </div>
  );
}

function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="button-row">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`button${opt.value === value ? " button--accent" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoCorrect,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "url" | "password";
  autoCorrect?: "on" | "off";
  autoCapitalize?: "on" | "off" | "none";
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        spellCheck={false}
        style={{
          background: "var(--bg-input)",
          padding: "10px 14px",
          borderRadius: 12,
          fontSize: 16,
          color: "var(--text)",
        }}
      />
    </div>
  );
}
