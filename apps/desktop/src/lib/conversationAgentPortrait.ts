import type { AgentActivityStatus, AgentVisualSettings, WorkbenchAgent } from "../types";
import { personaAvatars, personaSprites } from "./personaAvatarSource";
import { resolvePersonaSprite } from "./personaAvatarBundle";

/**
 * 대화 화면 에이전트 레일/스포트라이트가 쓰는 초상화 해석. 캐릭터 OS의 감정 피드백을
 * 한 곳에 모은다 — 표정 스프라이트(308장: 11 페르소나 × 28 감정)를 실제 활동 상태에서
 * 골라 보여주고, 없으면 neutral→아바타→이니셜로 폴백한다(가짜 표정 없음).
 *
 * 순수 함수 — 단위 테스트된다(번들 glob은 personaAvatarSource가 주입).
 */

/** 스프라이트/마크다운 페르소나 디렉토리 이름 — personaName 우선, 없으면 role (R2 1:1 규약). */
export function personaSlugForAgent(agent: Pick<WorkbenchAgent, "personaName" | "role">): string {
  return (agent.personaName?.trim() || agent.role).trim();
}

/**
 * 에이전트 활동 상태 → 표정 스프라이트 이름. 실제 상태에서만 표정을 고른다.
 * (해당 표정이 없는 페르소나는 resolvePersonaSprite가 neutral→아바타로 폴백)
 */
export function expressionForActivity(activity: AgentActivityStatus | undefined): string {
  switch (activity) {
    case "responding":
      return "joy";
    case "preparing":
    case "tooling":
    case "capturing":
    case "dispatching":
    case "testing":
      return "curiosity";
    case "waiting_approval":
      return "nervousness";
    case "error":
      return "disappointment";
    default:
      return "neutral";
  }
}

/**
 * 스포트라이트(상단 크게)용: 활동 상태에 맞는 표정 스프라이트를 우선한다 — 감정 표현이
 * 목적이므로 정적 업로드 아바타보다 표정을 앞에 둔다. 표정/아바타 모두 없으면 undefined.
 */
export function resolveAgentExpressionPortrait(
  agent: Pick<WorkbenchAgent, "personaName" | "role">,
  deps: { activity?: AgentActivityStatus; visuals?: AgentVisualSettings },
): string | undefined {
  const slug = personaSlugForAgent(agent);
  return (
    resolvePersonaSprite(slug, expressionForActivity(deps.activity), {
      sprites: personaSprites,
      avatars: personaAvatars,
    }) ?? deps.visuals?.avatarDataUrl
  );
}

/**
 * 레일(작은 아바타)용: 정체성 우선 — 업로드 아바타 > neutral 스프라이트 > 페르소나
 * 아바타. 작은 칸에서 표정이 바뀌면 산만하므로 항상 neutral로 안정적 식별.
 */
export function resolveAgentIdentityAvatar(
  agent: Pick<WorkbenchAgent, "personaName" | "role">,
  deps: { visuals?: AgentVisualSettings },
): string | undefined {
  if (deps.visuals?.avatarDataUrl) return deps.visuals.avatarDataUrl;
  const slug = personaSlugForAgent(agent);
  return resolvePersonaSprite(slug, "neutral", { sprites: personaSprites, avatars: personaAvatars });
}
