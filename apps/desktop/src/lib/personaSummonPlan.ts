import { buildPersonaPromptFragment, type LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, TmuxPaneRole } from "@ai-orchestrator/protocol";
import { agentSetHeaderLine, type PersonaAgentSet } from "./personaAgentSet";

/**
 * Turn a summoned AgentSession + its loaded persona into the concrete dispatch
 * steps that bind that identity into the pane and (optionally) hand it a first
 * task.
 *
 * This is the bridge between three pieces that already exist:
 *   - personaSummon  -> which pane the persona occupies (AgentSession)
 *   - @ai-orchestrator/agents.buildPersonaPromptFragment -> the identity blob
 *     (SAFETY.md boundaries + IDENTITY/SOUL/AGENTS/USER fragments)
 *   - the tmux dispatch path -> how text reaches the pane worker
 *
 * The returned `steps` are ordinary command strings; the caller dispatches them
 * through the same gated /tmux/dispatch + /approvals/replay path as any other
 * command (e.g. via the closed-loop runtime adapter), so persona injection is
 * gated and audited like everything else. This module performs no I/O.
 */

export type PersonaInjectionPlan = {
  agentId: string;
  paneId: string;
  role: TmuxPaneRole;
  /** fresh-agent boot steps (from the persona's agent set), dispatched before the identity */
  bootSteps: string[];
  /** identity preamble (safety boundaries + persona fragments) to send first */
  injectionText: string;
  /** ordered dispatch steps: agent boot, identity injection, then the optional kickoff task */
  steps: string[];
};

/**
 * 서버 /tmux/dispatch는 commandPreview(=실행 페이로드)를 8000자로 제한한다.
 * 풀 소울 페르소나(SAFETY+SOUL+AGENTS ≈ 18K)는 한 번에 못 들어가므로 주입
 * 텍스트를 이 한도 이하 조각으로 나눠 보낸다. 연속 마커가 붙어도 8000을
 * 넘지 않도록 여유를 둔 값.
 */
export const MAX_DISPATCH_TEXT_LENGTH = 7_600;

const CONTINUATION_SUFFIX = "\n\n(identity continues in the next message — do not respond yet)";
const CONTINUATION_PREFIX = "(identity continued)\n\n";

/** 줄 경계를 지키며 디스패치 한도 이하 조각으로 분할한다. 한 줄이 한도를 넘으면 글자 단위로 강제 분할. */
export function chunkDispatchText(text: string, maxLength = MAX_DISPATCH_TEXT_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = "";
    }
    if (line.length <= maxLength) {
      current = line;
      continue;
    }
    for (let offset = 0; offset < line.length; offset += maxLength) {
      const piece = line.slice(offset, offset + maxLength);
      if (piece.length === maxLength) {
        chunks.push(piece);
      } else {
        current = piece;
      }
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

/** 다중 조각 주입에 연속 마커를 달아 pane 에이전트가 중간에 응답하지 않게 한다. */
function markContinuations(chunks: string[]): string[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  return chunks.map((chunk, index) => {
    const prefixed = index === 0 ? chunk : `${CONTINUATION_PREFIX}${chunk}`;
    return index === chunks.length - 1 ? prefixed : `${prefixed}${CONTINUATION_SUFFIX}`;
  });
}

export function buildPersonaInjectionPlan(input: {
  session: AgentSession;
  persona: LoadedPersona;
  kickoffTask?: string;
  /** override the default header line placed atop the identity blob */
  headerLine?: string;
  /**
   * The persona's atomic agent set (SOUL/AGENTS + declared role/permission +
   * backing agent session). When present, its boot steps are prepended so the
   * pane gets a FRESH Hermes agent session — the new character never inherits
   * the previous character's context — and the header announces the declared
   * role so soul, agents, and role land as one unit.
   */
  agentSet?: PersonaAgentSet;
  /**
   * OPTIONAL lorebook/world-info fragment (built via @ai-orchestrator/agents
   * scanLorebooks + buildLorebookFragment). Appended after the identity so the
   * persona reads matched lore as part of its briefing. Empty/absent = no-op.
   */
  worldInfo?: string;
}): PersonaInjectionPlan {
  const { session, persona, kickoffTask, agentSet } = input;
  if (!session.paneId) {
    throw new Error(`cannot build injection plan: session ${session.id} has no pane bound`);
  }

  const agentId = session.agentId ?? persona.personaName;
  const headerLine =
    input.headerLine ??
    (agentSet
      ? agentSetHeaderLine(agentSet, session.role)
      : `You are now operating as "${agentId}" in the ${session.role} pane. Adopt the identity below and stay in it.`);

  const fragment = buildPersonaPromptFragment(persona, { headerLine });
  // Even when a persona has no SOUL/AGENTS files, give the worker at least the
  // header so the pane has an explicit identity tag.
  const identityText = fragment.trim().length > 0 ? fragment : headerLine;
  const worldInfo = input.worldInfo?.trim();
  const injectionText = worldInfo ? `${identityText}\n\n${worldInfo}` : identityText;

  const bootSteps = agentSet ? [...agentSet.bootSteps] : [];
  const kickoff = kickoffTask?.trim();
  const injectionChunks = markContinuations(chunkDispatchText(injectionText));
  const steps = kickoff ? [...bootSteps, ...injectionChunks, kickoff] : [...bootSteps, ...injectionChunks];

  return {
    agentId,
    paneId: session.paneId,
    role: session.role,
    bootSteps,
    injectionText,
    steps,
  };
}
