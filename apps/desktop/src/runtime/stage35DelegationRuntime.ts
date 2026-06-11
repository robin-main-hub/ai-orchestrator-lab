import type { DelegateTag } from "@ai-orchestrator/agents";
import { agentPrimaryDisplayName } from "../lib/agentDisplay";
import type { WorkbenchAgent } from "../types";

export type WorkbenchCompletionPurpose = "primary" | "delegation_subagent" | "delegation_followup";

export type WorkbenchCompletionResult = {
  content: string;
  metadata: Record<string, unknown>;
  /** the exact prompt messages sent — the conversation tool loop re-completes on top of these */
  pipelineMessages?: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string }>;
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
  const callerName = agentPrimaryDisplayName(caller);
  return [
    `[Delegated by ${callerName} / ${caller.role}]`,
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
  const callerName = agentPrimaryDisplayName(caller);
  const lines: string[] = [
    `${withSubjectParticle(callerName)} 작업 일부를 하위 에이전트에게 위임했습니다. 이제 당신의 목소리로 최종 사용자 응답을 작성하세요.`,
    "새 <delegate> 태그를 추가로 출력하지 마세요. 위임은 한 번의 순환으로만 처리합니다.",
    "하위 에이전트가 실패했거나 사용할 수 없었다면 투명하게 밝히고, 남아 있는 근거로 계속 진행하세요.",
    "",
    "원래 사용자 요청:",
    originalUserMessage,
    "",
    "초기 원문 응답:",
    stripDelegateTags(initialReply),
    "",
    "하위 에이전트 결과:",
  ];

  for (const outcome of outcomes) {
    lines.push("");
    lines.push(`## ${outcome.tag.target}`);
    lines.push(`작업: ${outcome.tag.prompt}`);
    switch (outcome.kind) {
      case "succeeded":
        lines.push(`상태: 완료 (${outcome.targetAgentName} / ${outcome.targetRole})`);
        lines.push(truncateDelegationText(outcome.response, 2200));
        break;
      case "blocked":
        lines.push(`상태: 차단 (${outcome.reason})`);
        break;
      case "unknown_target":
        lines.push("상태: 알 수 없는 대상");
        break;
      case "self_delegation":
        lines.push("상태: 자기 자신에게 위임 차단");
        break;
      case "failed":
        lines.push(`상태: 실패 (${outcome.reason})`);
        break;
    }
  }

  lines.push("");
  lines.push("최종 응답 지침:");
  lines.push("결과를 명확히 종합하고, 사용자의 다음 결정/행동을 앞에 두며, 실제 실행이 필요한 경우 승인 관문을 언급하세요.");
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

function withSubjectParticle(value: string) {
  const last = value.trim().at(-1);
  if (!last) return "이 동료가";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    return `${value}가`;
  }
  const hasFinalConsonant = (code - 0xac00) % 28 !== 0;
  return `${value}${hasFinalConsonant ? "이" : "가"}`;
}
