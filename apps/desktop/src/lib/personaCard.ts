import type { StatusBadgeVariant } from "@/ui/status-badge";

/**
 * Gacha-style persona card model. HP = memory quality, MP = trust, with a
 * rarity tier derived from their composite. Values default from a role tier
 * (so every seeded persona has a sensible card) but accept live overrides —
 * later these can bind to real memory-quality / trust signals. Pure + tested.
 */

export type PersonaRarity = "SSR" | "SR" | "R" | "N";

export type PersonaCardModel = {
  personaName: string;
  displayName: string;
  role: string;
  rarity: PersonaRarity;
  /** memory quality, 0..100 */
  hp: number;
  /** trust, 0..100 */
  mp: number;
  emblem: string;
  avatarUrl?: string;
};

/** Baseline memory/trust per role tier (0..1). Higher tiers => rarer cards. */
const ROLE_TIER: Record<string, { memory: number; trust: number; emblem: string }> = {
  orchestrator: { memory: 0.92, trust: 0.95, emblem: "지휘" },
  companion: { memory: 0.9, trust: 0.93, emblem: "본체" },
  architect: { memory: 0.85, trust: 0.8, emblem: "설계" },
  verifier: { memory: 0.8, trust: 0.85, emblem: "검증" },
  reviewer: { memory: 0.78, trust: 0.8, emblem: "리뷰" },
  auditor: { memory: 0.78, trust: 0.82, emblem: "감사" },
  risk_officer: { memory: 0.75, trust: 0.83, emblem: "리스크" },
  researcher: { memory: 0.72, trust: 0.65, emblem: "탐색" },
  domain_expert: { memory: 0.74, trust: 0.7, emblem: "전문" },
  skeptic: { memory: 0.7, trust: 0.6, emblem: "회의" },
  builder: { memory: 0.7, trust: 0.7, emblem: "구현" },
  executor: { memory: 0.68, trust: 0.72, emblem: "실행" },
  mediator: { memory: 0.7, trust: 0.75, emblem: "중재" },
  negotiator: { memory: 0.68, trust: 0.66, emblem: "협상" },
  memory_curator: { memory: 0.82, trust: 0.78, emblem: "기억" },
  watchdog: { memory: 0.72, trust: 0.84, emblem: "감시" },
  external: { memory: 0.6, trust: 0.5, emblem: "외부" },
};

const DEFAULT_TIER = { memory: 0.6, trust: 0.6, emblem: "에이전트" };

export function rarityForScore(score: number): PersonaRarity {
  if (score >= 0.85) return "SSR";
  if (score >= 0.7) return "SR";
  if (score >= 0.5) return "R";
  return "N";
}

const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100)));

export function buildPersonaCard(input: {
  personaName: string;
  displayName?: string;
  role: string;
  /** override memory quality (0..1) */
  memoryQuality?: number;
  /** override trust (0..1) */
  trust?: number;
  avatarUrl?: string;
}): PersonaCardModel {
  const tier = ROLE_TIER[input.role] ?? DEFAULT_TIER;
  const memory = input.memoryQuality ?? tier.memory;
  const trust = input.trust ?? tier.trust;
  return {
    personaName: input.personaName,
    displayName: input.displayName ?? input.personaName,
    role: input.role,
    rarity: rarityForScore((memory + trust) / 2),
    hp: clampPct(memory),
    mp: clampPct(trust),
    emblem: tier.emblem,
    avatarUrl: input.avatarUrl,
  };
}

export function rarityBadgeVariant(rarity: PersonaRarity): StatusBadgeVariant {
  switch (rarity) {
    case "SSR":
      return "warning";
    case "SR":
      return "reviewer";
    case "R":
      return "primary";
    case "N":
    default:
      return "muted";
  }
}

export function rarityClassName(rarity: PersonaRarity): string {
  return `persona-card-rarity-${rarity.toLowerCase()}`;
}
