export type ProductionSmokeMode = "automated" | "dry_run" | "live_opt_in" | "manual";

export type ProductionSmokeItem = {
  command?: string;
  id:
    | "boot"
    | "conversation"
    | "agent_memory"
    | "control_queue"
    | "debate_packet"
    | "tmux_recovery"
    | "provider_fallback"
    | "receipts_search"
    | "attachments"
    | "visual";
  label: string;
  mode: ProductionSmokeMode;
};

export type ProductionSmokePlan = {
  commandHints: string[];
  items: ProductionSmokeItem[];
};

export function createProductionSmokePlan({
  includeLiveProvider,
  includeVisual,
}: {
  includeLiveProvider: boolean;
  includeVisual: boolean;
}): ProductionSmokePlan {
  return {
    commandHints: [
      "pnpm --filter @ai-orchestrator/desktop typecheck",
      "pnpm --filter @ai-orchestrator/desktop test",
      "pnpm --filter @ai-orchestrator/desktop build",
      includeLiveProvider ? "pnpm provider:smoke:ai -- --run-mimo" : "pnpm provider:smoke:ai -- --dry-run",
    ],
    items: [
      { id: "boot", label: "앱 부팅과 기본 Cockpit 진입", mode: "automated" },
      { id: "conversation", label: "에이전트 대화와 pending 표시", mode: "automated" },
      { id: "agent_memory", label: "에이전트별 SOUL/AGENTS/장기 기억 준비", mode: "automated" },
      { id: "control_queue", label: "Control Queue lane 동작", mode: "automated" },
      { id: "debate_packet", label: "Debate 결정에서 Coding Packet 생성", mode: "automated" },
      { id: "tmux_recovery", label: "Tmux 재실행/캡처/복구 판정", mode: "automated" },
      {
        id: "provider_fallback",
        label: "Provider fallback과 live 호출",
        mode: includeLiveProvider ? "live_opt_in" : "dry_run",
      },
      { id: "receipts_search", label: "공개 영수증 검색과 마스킹", mode: "automated" },
      { id: "attachments", label: "첨부파일 분류와 처리 계획", mode: "automated" },
      { id: "visual", label: "v0 검은 테마 시각 회귀", mode: includeVisual ? "manual" : "manual" },
    ],
  };
}
