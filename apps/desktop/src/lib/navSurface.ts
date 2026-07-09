import type { CenterMode, NavItemId } from "../types";

/**
 * 네비게이션은 두 좌표축으로 갈려 있다: 상단 `mode`(CenterMode)와 좌측
 * `activeNavItem`(NavItemId). 둘은 `navCenterActive`로 상호 배제된다 — 좌측 nav가
 * 아래 집합에 속하면 nav가 중앙 보드를 점유하고(상단 mode 화면은 가려짐), 그렇지
 * 않으면(none / config_files) mode가 중앙을 점유한다.
 *
 * 이 모듈은 "어느 축이 지금 중앙인가"의 판정과 단일 좌표(ActiveSurface) 기술을 한
 * 곳에 모은다. 두 useState는 그대로 두되(전 화면이 mode/navCenterActive에 의존하는
 * blast radius를 피한다), 판정 로직과 '중앙을 점유하는 nav 목록'을 더 이상 App.tsx
 * 인라인 `||` 체인에 흩뿌리지 않는다 — 점진적 단일축 통합의 어댑터.
 */
export const NAV_CENTER_ITEMS = [
  "dashboard",
  "sessions",
  "projects",
  "providers",
  "channels",
  "backup",
  "run",
  "theater",
  "coding",
  "research",
  "rmas",
  "command_center",
] as const satisfies readonly NavItemId[];

export type NavCenterItem = (typeof NAV_CENTER_ITEMS)[number];

/** 좌측 nav가 중앙 보드를 점유하는가(=상단 mode 화면을 가리는가). */
export function isNavCenterActive(activeNavItem: NavItemId): boolean {
  return (NAV_CENTER_ITEMS as readonly NavItemId[]).includes(activeNavItem);
}

/**
 * 활성 표면을 가리키는 단일 좌표. nav가 중앙이면 `{ axis: "nav", item }`,
 * 아니면 `{ axis: "mode", mode }` — 두 축을 하나의 값으로 읽는다.
 */
export type ActiveSurface =
  | { axis: "nav"; item: NavCenterItem }
  | { axis: "mode"; mode: CenterMode };

export function resolveActiveSurface(input: { mode: CenterMode; activeNavItem: NavItemId }): ActiveSurface {
  if (isNavCenterActive(input.activeNavItem)) {
    return { axis: "nav", item: input.activeNavItem as NavCenterItem };
  }
  return { axis: "mode", mode: input.mode };
}

/**
 * 상단 mode 탭이 중앙을 가져갈 때 nav를 비우는 센티넬. `activeNavItem === "none"`이
 * "mode 축이 활성"을 뜻한다 — onChangeMode와 mode 변경 effect가 같은 값을 써서
 * 동선이 갈리지 않게 한다(이전엔 클릭=none, effect=sessions로 어긋났다).
 */
export const MODE_OWNS_CENTER_NAV: NavItemId = "none";
