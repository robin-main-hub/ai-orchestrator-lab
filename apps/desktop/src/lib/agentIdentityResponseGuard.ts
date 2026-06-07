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
  /이름.*(알려|말해|있어|있니|있냐)/,
  /너.*이름/,
  /네.*이름/,
  /성함.*(뭐|뭔|누구|알려|말해)/,
  /누구(야|세요|냐)/,
  /who are you/i,
  /what(?:'s| is) your name/i,
];

const nameDenialPatterns = [
  /이름[은이]?\s*(없|없다|없어)/,
  /이름[을를]\s*(가지고|갖고)?\s*있지\s*(않|않다|않아)/,
  /별도(?:의)?\s*이름/,
  /역할로\s*부르/,
  /역할명으로\s*부르/,
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
  const displayName = agentPrimaryDisplayName(agent);
  const answeredWithPrimaryName = content.includes(displayName);
  if (!askedName || (!deniedName && answeredWithPrimaryName)) {
    return { content, guardApplied: false };
  }

  const roleLabel = agentSecondaryDisplayLabel(agent);
  return {
    content: `나는 ${displayName}야. 이 대화방에서는 ${roleLabel} 역할로 계속 이어서 도와줄게.`,
    guardApplied: true,
  };
}
