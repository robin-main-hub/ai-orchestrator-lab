import type { DelegateTag } from "@ai-orchestrator/agents";
import type { WorkbenchAgent } from "../types";

export type WorkbenchCompletionPurpose = "primary" | "delegation_subagent" | "delegation_followup";

export type WorkbenchCompletionResult = {
  content: string;
  metadata: Record<string, unknown>;
};

export type DesktopDelegationOutcome =
  | {
      kind: "succeeded";
      tag: DelegateTag;
      targetAgentId: string;
      targetAgentName: string;
      targetRole: WorkbenchAgent["role"];
      providerProfileId: string;
      modelId: string;
      response: string;
    }
  | { kind: "blocked"; tag: DelegateTag; reason: string }
  | { kind: "unknown_target"; tag: DelegateTag }
  | { kind: "self_delegation"; tag: DelegateTag }
  | {
      kind: "failed";
      tag: DelegateTag;
      targetAgentId: string;
      targetAgentName: string;
      reason: string;
    };

export function delegationAuthorityLevel(agent: WorkbenchAgent) {
  return agent.role === "companion" ? "orchestrator_plus" : "agent";
}

export function resolveDelegationTargetAgent(
  target: string,
  caller: WorkbenchAgent,
  agents: WorkbenchAgent[],
) {
  const normalizedTarget = normalizeDelegationKey(target);
  const elevatedCaller = caller.role === "companion" || caller.role === "orchestrator";
  return agents.find((agent) => {
    if (agent.id === caller.id) {
      return false;
    }
    if (!agent.enabled && !elevatedCaller) {
      return false;
    }

    return [agent.id, agent.name, agent.role, agent.personaName]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeDelegationKey(value) === normalizedTarget);
  });
}

export function serializeDelegationOutcome(outcome: DesktopDelegationOutcome) {
  const base = {
    kind: outcome.kind,
    target: outcome.tag.target,
    prompt: outcome.tag.prompt,
    raw: outcome.tag.raw,
  };

  switch (outcome.kind) {
    case "succeeded":
      return {
        ...base,
        status: "succeeded",
        targetAgentId: outcome.targetAgentId,
        targetAgentName: outcome.targetAgentName,
        targetRole: outcome.targetRole,
        providerProfileId: outcome.providerProfileId,
        modelId: outcome.modelId,
        response: outcome.response,
      };
    case "blocked":
      return { ...base, status: "blocked", reason: outcome.reason };
    case "unknown_target":
      return { ...base, status: "unknown_target" };
    case "self_delegation":
      return { ...base, status: "self_delegation" };
    case "failed":
      return {
        ...base,
        status: "failed",
        targetAgentId: outcome.targetAgentId,
        targetAgentName: outcome.targetAgentName,
        reason: outcome.reason,
      };
  }
}

export function buildDelegatedAgentPrompt({
  caller,
  originalUserMessage,
  tag,
}: {
  caller: WorkbenchAgent;
  originalUserMessage: string;
  tag: DelegateTag;
}) {
  return [
    `[Delegated by ${caller.name} / ${caller.role}]`,
    "",
    "You are being called as a specialist sub-agent inside AI Orchestrator Lab.",
    "Answer in Korean unless the task explicitly asks for another language.",
    "Do not call other agents. Do not emit <delegate> tags. Depth is limited to 1.",
    "If the task implies terminal execution, file changes, outbound messages, or external side effects, provide an analysis or plan only and say that execution needs the permission gate.",
    "",
    "Original user request:",
    originalUserMessage,
    "",
    "Delegated task:",
    tag.prompt,
  ].join("\n");
}

export function buildDelegationFollowupPrompt({
  caller,
  initialReply,
  originalUserMessage,
  outcomes,
}: {
  caller: WorkbenchAgent;
  initialReply: string;
  originalUserMessage: string;
  outcomes: DesktopDelegationOutcome[];
}) {
  const lines: string[] = [
    `${caller.name} delegated parts of the work to sub-agents. Now produce the final user-facing answer in your own voice.`,
    "Do not emit any new <delegate> tags in this follow-up. One delegation cycle only.",
    "If a sub-agent failed or was unavailable, be transparent and continue with the available evidence.",
    "",
    "Original user request:",
    originalUserMessage,
    "",
    "Your initial raw response:",
    stripDelegateTags(initialReply),
    "",
    "Sub-agent results:",
  ];

  for (const outcome of outcomes) {
    lines.push("");
    lines.push(`## ${outcome.tag.target}`);
    lines.push(`Task: ${outcome.tag.prompt}`);
    switch (outcome.kind) {
      case "succeeded":
        lines.push(`Status: succeeded (${outcome.targetAgentName} / ${outcome.targetRole})`);
        lines.push(truncateDelegationText(outcome.response, 2200));
        break;
      case "blocked":
        lines.push(`Status: blocked (${outcome.reason})`);
        break;
      case "unknown_target":
        lines.push("Status: unknown target");
        break;
      case "self_delegation":
        lines.push("Status: self delegation blocked");
        break;
      case "failed":
        lines.push(`Status: failed (${outcome.reason})`);
        break;
    }
  }

  lines.push("");
  lines.push("Final answer instructions:");
  lines.push("Synthesize the results clearly, keep the user's decision/action next, and mention approval gates for any real execution.");
  return lines.join("\n");
}

function normalizeDelegationKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function stripDelegateTags(value: string) {
  return value.replace(/<delegate\s+to="([a-zA-Z_][a-zA-Z0-9_-]*)"\s*>[\s\S]*?<\/delegate>/g, "").trim();
}

function truncateDelegationText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
