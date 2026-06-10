import { getPersonaAvatarUrl } from "./personaAvatars";

/**
 * 페르소나 surface 공용 초상화 리졸버 — tmux 보드(panePortraitUrl)와 같은 원리로,
 * 번들된 캐릭터 아트(agents/<personaName | role>/avatar.*)를 personaName 우선,
 * 없으면 role 슬러그로 찾는다. 둘 다 없을 때만 undefined(이니셜 폴백).
 *
 * 대화/토론/관제판은 그동안 이 경로를 안 써서 초상화가 안 떴다(대화는 localStorage
 * 빈 값 그림자, 토론은 렌더 코드 부재, 관제판은 빈 레지스트리). 이 리졸버로 통일한다.
 */
export function resolvePersonaPortraitUrl(
  personaName?: string,
  role?: string,
): string | undefined {
  return getPersonaAvatarUrl(personaName) ?? getPersonaAvatarUrl(role);
}
