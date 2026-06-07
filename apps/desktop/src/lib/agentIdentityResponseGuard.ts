import type { WorkbenchAgent } from "../types";
import { agentPrimaryDisplayName, agentSecondaryDisplayLabel } from "./agentDisplay";

export type AgentIdentityResponseGuardInput = {
  agent: WorkbenchAgent;
  content: string;
  userContent: string;
};

export type AgentIdentityResponseGuardResult = {
  content: string;
  guardApplied: boolean;
};

const nameQuestionPatterns = [
  /이름.*(뭐|뭔|누구)/,
  /누구(야|세요|냐)/,
  /who are you/i,
  /what(?:'s| is) your name/i,
];

const nameDenialPatterns = [
  /이름[은이]?\s*(없|없다|없어)/,
  /역할로\s*부르/,
  /no name/i,
  /do not have (?:a )?name/i,
];

export function applyAgentIdentityResponseGuard({
  agent,
  content,
  userContent,
}: AgentIdentityResponseGuardInput): AgentIdentityResponseGuardResult {
  const askedName = nameQuestionPatterns.some((pattern) => pattern.test(userContent));
  const deniedName = nameDenialPatterns.some((pattern) => pattern.test(content));
  if (!askedName || !deniedName) {
    return { content, guardApplied: false };
  }

  const displayName = agentPrimaryDisplayName(agent);
  const roleLabel = agentSecondaryDisplayLabel(agent);
  return {
    content: `나는 ${displayName}야. 이 대화방에서는 ${roleLabel} 역할로 계속 이어서 도와줄게.`,
    guardApplied: true,
  };
}
