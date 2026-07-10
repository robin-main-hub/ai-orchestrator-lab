import type { ModelDescriptor, ProviderProfile } from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import type { AgentChannelMemoryScope } from "../../lib/agentConversationChannels";
import {
  createAgentConversationFlowCards,
  type AgentConversationFlowTone,
} from "../../lib/agentConversationFlow";
import type { WorkbenchAgent } from "../../types";

const toneClassNames: Record<AgentConversationFlowTone, string> = {
  ready: "border-primary/20 bg-primary/[0.06] text-primary",
  manual: "border-primary/20 bg-primary/[0.06] text-primary",
  error: "border-destructive/25 bg-destructive/[0.08] text-destructive",
};

export function AgentConversationFlowPanel({
  adapterStatus,
  memoryRecordCount,
  memoryScope,
  selectedAgent,
  selectedModel,
  selectedProvider,
}: {
  adapterStatus: "loading" | "ready" | "error";
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  selectedAgent?: WorkbenchAgent;
  selectedModel?: ModelDescriptor;
  selectedProvider?: ProviderProfile;
}) {
  if (!selectedAgent) return null;

  const cards = createAgentConversationFlowCards({
    agent: selectedAgent,
    adapterStatus,
    memoryRecordCount,
    memoryScope,
    modelId: selectedModel?.id,
    modelName: selectedModel?.name,
    providerProfileId: selectedProvider?.id,
    providerName: selectedProvider?.name,
  });

  return (
    <div className="border-b border-white/10 bg-surface/85 px-4 py-2 backdrop-blur-xl">
      <div className="mx-auto grid max-w-6xl gap-2 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <section
            aria-label={`${card.label}: ${card.value}`}
            className={cn(
              "min-w-0 rounded-lg border px-3 py-2 shadow-lg shadow-black/20",
              toneClassNames[card.tone],
            )}
            key={card.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {card.label}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            </div>
            <p className="mt-1 truncate text-xs font-semibold">{card.value}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {card.details.slice(0, 3).map((detail) => (
                <span
                  className="max-w-full truncate rounded-full border border-current/10 bg-black/20 px-1.5 py-0.5 text-[9px] opacity-80"
                  key={detail}
                  title={detail}
                >
                  {detail}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
