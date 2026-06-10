import { Bot } from "lucide-react";
import { StatusBadge } from "@/ui/status-badge";
import { rarityBadgeVariant, rarityClassName, type PersonaCardModel } from "../lib/personaCard";

/**
 * Gacha-style persona card: portrait + rarity frame (SSR gets the rainbow class
 * the app CSS styles), HP (memory quality) / MP (trust) bars, and a role
 * emblem. Presentational + static-markup tested.
 */
export function PersonaCard({ card, compact = false }: { card: PersonaCardModel; compact?: boolean }) {
  return (
    <article className={`persona-card ${rarityClassName(card.rarity)} ${compact ? "compact" : ""}`}>
      {card.avatarUrl ? (
        <div className="persona-card-banner">
          <img src={card.avatarUrl} alt="" loading="lazy" />
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
        <StatusBadge size="sm" variant={rarityBadgeVariant(card.rarity)}>
          {card.rarity}
        </StatusBadge>
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
