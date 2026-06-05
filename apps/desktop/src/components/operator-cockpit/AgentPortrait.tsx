import React, { useMemo, useState } from "react";
import type { AgentRole } from "@ai-orchestrator/protocol";
import { AgentPortraitFrame } from "./AgentPortraitFrame";
import { getAgentPortraitSet } from "./data/agent-portraits";
import type { AgentExpression } from "./types/agent-expressions";
import { initials } from "./presentation";

export function AgentPortrait({
  active,
  agentId,
  displayName,
  expression = "neutral",
  role,
}: {
  active?: boolean;
  agentId: string;
  displayName?: string;
  expression?: AgentExpression;
  role: AgentRole;
}) {
  const portraitSet = useMemo(() => getAgentPortraitSet(agentId, role, displayName), [agentId, displayName, role]);
  const src = portraitSet.portraits[expression] ?? portraitSet.portraits[portraitSet.defaultExpression];
  const [imageUnavailable, setImageUnavailable] = useState(portraitSet.imageAssetsAvailable === false);
  const shouldLoadImage = portraitSet.imageAssetsAvailable !== false && !imageUnavailable;

  return (
    <AgentPortraitFrame active={active} glowColor={portraitSet.glowColor}>
      {shouldLoadImage ? (
        <img
          alt={`${portraitSet.name} ${expression} portrait`}
          className="relative z-[1] h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageUnavailable(true)}
          src={src}
        />
      ) : (
        <span className="relative z-[1] flex h-full w-full items-center justify-center bg-zinc-900 text-[11px] font-black tracking-tight text-zinc-100">
          {initials(portraitSet.name)}
        </span>
      )}
    </AgentPortraitFrame>
  );
}
