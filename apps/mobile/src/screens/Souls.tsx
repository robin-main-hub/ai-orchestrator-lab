import { useRef, useState, type ChangeEvent } from "react";
import type { MobileSoul } from "../types";
import { seedSouls } from "../seeds";
import { getSoulBackground, useSoulBackground } from "../hooks/useBackgroundImage";

type Props = {
  activeSoulId: string;
  onSelectSoul: (soulId: string) => void;
  onStartChatWith: (soulId: string) => void;
};

export function Souls({ activeSoulId, onSelectSoul, onStartChatWith }: Props) {
  const [detailSoulId, setDetailSoulId] = useState<string | null>(null);
  const detail = detailSoulId ? seedSouls.find((s) => s.id === detailSoulId) ?? null : null;

  if (detail) {
    return (
      <SoulDetail
        soul={detail}
        isActive={detail.id === activeSoulId}
        onBack={() => setDetailSoulId(null)}
        onStartChat={() => {
          onSelectSoul(detail.id);
          onStartChatWith(detail.id);
        }}
      />
    );
  }

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title">SOUL</div>
      </header>
      <div className="screen__body">
        <section className="section">
          <div className="section__title">현재 대화 상대</div>
          <SoulCard
            soul={seedSouls.find((s) => s.id === activeSoulId) ?? seedSouls[0]!}
            onTap={(id) => setDetailSoulId(id)}
          />
        </section>
        <section className="section">
          <div className="section__title">모든 SOUL</div>
          {seedSouls.map((soul) => (
            <SoulCard key={soul.id} soul={soul} onTap={(id) => setDetailSoulId(id)} />
          ))}
        </section>
      </div>
    </div>
  );
}

function SoulCard({ soul, onTap }: { soul: MobileSoul; onTap: (id: string) => void }) {
  const bg = getSoulBackground(soul.id);
  return (
    <div className="soul-card" onClick={() => onTap(soul.id)} role="button">
      <div className="soul-card__avatar" style={{ background: soul.accentColor }}>
        {soul.avatarEmoji}
      </div>
      <div className="soul-card__body">
        <div className="soul-card__name">{soul.name}</div>
        <div className="soul-card__tagline">{soul.tagline}</div>
      </div>
      <div
        className="soul-card__bg-thumb"
        style={bg ? { backgroundImage: `url("${bg}")` } : undefined}
        aria-label={bg ? "사용자 배경 설정됨" : "배경 미설정"}
      />
    </div>
  );
}

function SoulDetail({
  soul,
  isActive,
  onBack,
  onStartChat,
}: {
  soul: MobileSoul;
  isActive: boolean;
  onBack: () => void;
  onStartChat: () => void;
}) {
  const { dataUrl, setFromFile, clear } = useSoulBackground(soul.id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      console.warn("[mobile] background must be an image");
      return;
    }
    try {
      await setFromFile(soul.id, file);
    } catch (err) {
      console.warn("[mobile] failed to load background image", err);
    }
    event.target.value = "";
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <button type="button" className="screen__back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="screen__title">{soul.name}</div>
        {isActive ? <span className="chip chip--trusted">활성</span> : null}
      </header>
      <div className="screen__body">
        <div
          className="soul-detail__hero"
          style={dataUrl ? { backgroundImage: `url("${dataUrl}")` } : undefined}
        >
          <div className="soul-detail__hero-overlay" />
          <div className="soul-detail__hero-content">
            <div className="soul-detail__hero-avatar" style={{ background: soul.accentColor }}>
              {soul.avatarEmoji}
            </div>
            <div>
              <div className="soul-detail__hero-name">{soul.name}</div>
              <div className="soul-detail__hero-tagline">{soul.tagline}</div>
            </div>
          </div>
        </div>

        <section className="section">
          <div className="section__title">대화</div>
          <button type="button" className="button button--accent" onClick={onStartChat}>
            이 SOUL과 새 대화 시작
          </button>
        </section>

        <section className="section">
          <div className="section__title">채팅 배경 (이 SOUL 전용)</div>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => fileInputRef.current?.click()}
            >
              이미지 선택
            </button>
            {dataUrl ? (
              <button
                type="button"
                className="button button--danger"
                onClick={() => clear(soul.id)}
              >
                제거
              </button>
            ) : null}
          </div>
          <div className="settings__hint">
            배경은 SOUL마다 따로 저장됩니다. 다른 SOUL과 대화로 전환하면 그 SOUL의 배경이
            자동 적용됩니다. 이미지는 기기 안에만 저장됩니다.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </section>

        {soul.markdownPath ? (
          <section className="section">
            <div className="section__title">SOUL 소스</div>
            <div className="row">
              <div className="row__label">파일</div>
              <div className="row__value">{soul.markdownPath}</div>
            </div>
            <div className="settings__hint">
              SOUL 문서 편집은 데스크탑 ConfigLibrary에서 진행합니다. 모바일은 미리보기까지
              지원 예정.
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
