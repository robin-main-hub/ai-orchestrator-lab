import { useState } from "react";
import { Bot } from "lucide-react";
import { rarityClassName, type PersonaCardModel } from "../lib/personaCard";

/**
 * Gacha-style persona card: portrait + rarity frame (SSR gets the rainbow class
 * the app CSS styles), HP (memory quality) / MP (trust) bars, and a role
 * emblem. Presentational + static-markup tested.
 */
export function PersonaCard({ card, compact = false }: { card: PersonaCardModel; compact?: boolean }) {
  // 아바타가 깨진 URL이면 배너 칸만 조용히 접는다 (헤더 초상은 placeholder가 받쳐줌)
  const [bannerBroken, setBannerBroken] = useState(false);
  return (
    <article className={`persona-card ${rarityClassName(card.rarity)} ${compact ? "compact" : ""}`}>
      {card.avatarUrl && !bannerBroken ? (
        <div className="persona-card-banner">
          {/* 배경은 blur cover로 칸을 채우고 전경은 contain — 정사각·투명배경 스프라이트도 잘리지 않는다 */}
          <img className="persona-card-banner-backdrop" src={card.avatarUrl} alt="" aria-hidden="true" />
          <img
            className="persona-card-banner-art"
            src={card.avatarUrl}
            alt=""
            loading="lazy"
            onError={() => setBannerBroken(true)}
          />
        </div>
      ) : null}
      <header className="persona-card-header">
        {card.avatarUrl ? (
          <img className="persona-card-portrait" src={card.avatarUrl} alt="" width={compact ? 32 : 56} height={compact ? 32 : 56} />
        ) : (
          <span className="persona-card-portrait placeholder" aria-hidden="true">
            <Bot size={compact ? 18 : 28} />
          </span>
        )}
        <div className="persona-card-id">
          <strong>{card.displayName}</strong>
          <span className="persona-card-emblem">{card.emblem}</span>
        </div>
        <span className={`persona-card__rarity persona-card__rarity--${card.rarity.toLowerCase()}`}>
          {card.rarity}
        </span>
      </header>
      <div className="persona-card-stats">
        <Stat label="HP" sub="기억" value={card.hp} tone="hp" />
        <Stat label="MP" sub="신뢰" value={card.mp} tone="mp" />
      </div>
    </article>
  );
}

function Stat({ label, sub, value, tone }: { label: string; sub: string; value: number; tone: "hp" | "mp" }) {
  return (
    <div className={`persona-card-stat ${tone}`}>
      <span className="persona-card-stat-label">
        {label} <em>{sub}</em>
      </span>
      <span className="persona-card-stat-bar" role="img" aria-label={`${label} ${value}`}>
        <span className="persona-card-stat-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="persona-card-stat-value">{value}</span>
    </div>
  );
}
