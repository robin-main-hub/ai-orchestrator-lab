import type {
  MobileCodingPacket,
  MobileDebateRound,
  MobileHandoff,
  MobileMemoryItem,
  MobileProviderEntry,
  MobileRuntimeSnapshot,
  MobileSoul,
} from "./types";

/**
 * Seed data for the mobile shell while the backend wiring PR is still in
 * flight. Mirrors the shape the real protocol-side endpoints will return so
 * swapping to live data is a localized change in each screen.
 */

export const seedSouls: MobileSoul[] = [
  {
    id: "soul_orchestrator",
    name: "Orchestrator",
    tagline: "전체 흐름 조율",
    avatarEmoji: "🎼",
    accentColor: "#7c5cff",
    markdownPath: "agents/orchestrator/SOUL.md",
  },
  {
    id: "soul_tracy",
    name: "Tracy",
    tagline: "영업본부 영문 draft 담당",
    avatarEmoji: "🌿",
    accentColor: "#3fb39c",
    markdownPath: "agents/tracy/SOUL.md",
  },
  {
    id: "soul_본부장",
    name: "본부장",
    tagline: "거래처 관계·협상 자문",
    avatarEmoji: "🧭",
    accentColor: "#d97b3a",
    markdownPath: "agents/본부장/SOUL.md",
  },
  {
    id: "soul_architect",
    name: "Architect",
    tagline: "구조·트레이드오프 검토",
    avatarEmoji: "📐",
    accentColor: "#5c8cff",
  },
  {
    id: "soul_reviewer",
    name: "Reviewer",
    tagline: "코드·문서 비판적 리뷰",
    avatarEmoji: "🔍",
    accentColor: "#ff8c5c",
  },
];

export const seedRuntime: MobileRuntimeSnapshot = {
  status: "degraded",
  serverEndpoint: "https://orchestrator.endruin.com",
  lastProbeAt: new Date().toISOString(),
  modelCount: 8,
  providerCount: 7,
};

export const seedProviders: MobileProviderEntry[] = [
  {
    id: "provider_codex_oauth",
    name: "Codex OAuth Session",
    trustLevel: "trusted",
    secretAvailability: "available",
    modelCount: 4,
    tags: ["oauth", "main", "fast"],
  },
  {
    id: "provider_dgx02_vllm",
    name: "DGX-02 vLLM",
    trustLevel: "trusted",
    secretAvailability: "available",
    modelCount: 1,
    tags: ["dgx", "vllm", "local"],
  },
  {
    id: "provider_apifun_claude",
    name: "APIKey.fun Claude A",
    trustLevel: "untrusted",
    secretAvailability: "available",
    modelCount: 5,
    tags: ["reseller", "claude"],
  },
  {
    id: "provider_apifun_claude_b",
    name: "APIKey.fun Claude B",
    trustLevel: "untrusted",
    secretAvailability: "available",
    modelCount: 5,
    tags: ["reseller", "claude"],
  },
  {
    id: "provider_apikeyfun_codex",
    name: "APIKey.fun Codex",
    trustLevel: "untrusted",
    secretAvailability: "available",
    modelCount: 3,
    tags: ["reseller", "codex-api"],
  },
  {
    id: "provider_grok_oauth_dgx",
    name: "Grok OAuth #1",
    trustLevel: "limited",
    secretAvailability: "expired",
    modelCount: 3,
    tags: ["oauth", "grok"],
  },
  {
    id: "provider_grok_oauth_dgx_2",
    name: "Grok OAuth #2",
    trustLevel: "limited",
    secretAvailability: "expired",
    modelCount: 3,
    tags: ["oauth", "grok"],
  },
];

export const seedMemory: MobileMemoryItem[] = [
  {
    id: "mem_001",
    title: "거래처 A 협상 전제",
    excerpt: "직접 요구하지 않고 환경 데이터로 자발적 양보를 유도한다.",
    trustLevel: "trusted",
    sourceChannel: "desktop",
    createdAt: "2026-05-20T10:12:00.000Z",
  },
  {
    id: "mem_002",
    title: "DOMAIN-WIKI v4 Step 2 진입 조건",
    excerpt: "Step 1 완료. 미팅 transcript는 정식 source pack으로 다룬다.",
    trustLevel: "trusted",
    sourceChannel: "desktop",
    createdAt: "2026-05-22T14:30:00.000Z",
  },
  {
    id: "mem_003",
    title: "DGX vLLM 부팅 안전 3룰",
    excerpt: "노드당 1개. RAM <100GiB면 보류. 부팅 전 사용자 confirm.",
    trustLevel: "trusted",
    sourceChannel: "system",
    createdAt: "2026-05-24T09:00:00.000Z",
  },
];

export const seedCodingPackets: MobileCodingPacket[] = [
  {
    id: "packet_001",
    goal: "어댑터 인프라 위에 Anthropic 어댑터 구현",
    status: "ready",
    filesToInspect: [
      "packages/providers/src/adapter.ts",
      "packages/providers/src/errors.ts",
      "docs/25-anthropic-adapter-spec.md",
    ],
    createdAt: "2026-05-25T05:00:00.000Z",
  },
  {
    id: "packet_002",
    goal: "Codex CLI OAuth adapter (exec --json)",
    status: "draft",
    filesToInspect: [
      "packages/providers/src/adapter.ts",
      "apps/server/src/index.ts",
    ],
    createdAt: "2026-05-25T07:00:00.000Z",
  },
];

export const seedDebates: MobileDebateRound[] = [
  {
    id: "debate_001_round_1",
    debateTitle: "Codex OAuth 메인 전환 vs DGX dense 메인",
    kind: "final_decision",
    status: "completed",
    utteranceCount: 6,
  },
  {
    id: "debate_002_round_1",
    debateTitle: "Vertical Slice 1 범위 확정",
    kind: "problem_definition",
    status: "completed",
    utteranceCount: 4,
  },
];

export const seedHandoffs: MobileHandoff[] = [
  {
    id: "handoff_001",
    title: "C1 머지 후 desktop bearer 부착",
    fromAgent: "claude",
    toAgent: "codex",
    status: "accepted",
    createdAt: "2026-05-25T01:00:00.000Z",
  },
];
