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

/* ------------------------------------------------------------------ *
 * 상위 정보구조 (5-section shell)
 *
 * 기존 이중축(activeNavItem / CenterMode)은 그대로 두고, 그 위에 사람이 읽는
 * 단일 5섹션 좌표를 얹는다. 이 모듈은 다음을 한 곳에 모은다:
 *   - 현재 (mode, nav, configLibrary) → { section, tab } 로 읽기(resolveAppLocation)
 *   - { section, tab } → 기존 (mode, nav, configLibrary) 변경 의도로 쓰기
 *     (navigationIntentForTab)
 * 어느 것도 새 라우팅 축을 만들지 않는다 — 기존 ActiveSurface 판정을 재사용한다.
 * ------------------------------------------------------------------ */

/** 최상위 5개 섹션 (Primary Rail). */
export const PRIMARY_SECTIONS = ["command", "studio", "operations", "library", "system"] as const;
export type AppSection = (typeof PRIMARY_SECTIONS)[number];

/** 섹션별 하위 탭 식별자 — 이번 단계에서 실제 surface가 있는 것만. */
export type SectionTab =
  // command
  | "overview"
  | "attention"
  | "cockpit"
  // studio
  | "chat"
  | "code"
  | "research"
  | "debate"
  // operations
  | "launch"
  | "live"
  | "terminal"
  // library
  | "workspaces"
  | "sessions"
  // system
  | "providers"
  | "sources"
  | "config"
  | "backup";

/** 단일 위치 좌표: "지금 화면이 어느 섹션의 어느 탭인가". */
export type AppLocation = { section: AppSection; tab: SectionTab };

/**
 * 한 탭이 기존 상태로 어떻게 매핑되는지 기술하는 순수 데이터.
 * `nav`가 있으면 좌측축, `mode`가 있으면 상단축을 점유한다. 둘 중 하나만 둔다.
 * `config`가 true면 config 라이브러리 진입(activeNavItem="config_files").
 */
type SectionTabSpec =
  | { tab: SectionTab; nav: NavCenterItem }
  | { tab: SectionTab; mode: CenterMode }
  | { tab: SectionTab; config: true };

/**
 * 섹션 → 탭 목록 (표시 순서). 실제 surface가 준비된 탭만 포함한다 —
 * fake / disabled 탭은 두지 않는다.
 */
export const SECTION_TABS: Record<AppSection, SectionTabSpec[]> = {
  command: [
    { tab: "overview", nav: "dashboard" },
    { tab: "attention", nav: "command_center" },
    { tab: "cockpit", mode: "cockpit" },
  ],
  studio: [
    { tab: "chat", mode: "conversation" },
    { tab: "code", nav: "coding" },
    { tab: "research", nav: "research" },
    { tab: "debate", mode: "debate" },
  ],
  operations: [
    { tab: "launch", nav: "run" },
    { tab: "live", nav: "theater" },
    { tab: "terminal", mode: "tmux" },
  ],
  library: [
    { tab: "workspaces", nav: "projects" },
    { tab: "sessions", nav: "sessions" },
  ],
  system: [
    { tab: "providers", nav: "providers" },
    { tab: "sources", nav: "channels" },
    { tab: "config", config: true },
    { tab: "backup", nav: "backup" },
  ],
};

/** 섹션을 클릭했을 때 들어갈 대표(첫) 탭. */
export const SECTION_DEFAULT_TAB: Record<AppSection, SectionTab> = {
  command: "overview",
  studio: "chat",
  operations: "launch",
  library: "workspaces",
  system: "providers",
};

/**
 * 현재 활성 표면 + config 라이브러리 여부 → 단일 5섹션 좌표.
 * config 라이브러리가 열려 있으면 nav/mode 축보다 우선해 System/Config로 읽는다
 * (configLibraryActive === activeNavItem "config_files" 이며, 이는 nav center 집합에
 * 속하지 않아 별도 판정이 필요하다).
 */
export function resolveAppLocation(input: {
  activeSurface: ActiveSurface;
  configLibraryActive: boolean;
}): AppLocation {
  if (input.configLibraryActive) {
    return { section: "system", tab: "config" };
  }
  const { activeSurface } = input;
  for (const section of PRIMARY_SECTIONS) {
    for (const spec of SECTION_TABS[section]) {
      if ("nav" in spec && activeSurface.axis === "nav" && activeSurface.item === spec.nav) {
        return { section, tab: spec.tab };
      }
      if ("mode" in spec && activeSurface.axis === "mode" && activeSurface.mode === spec.mode) {
        return { section, tab: spec.tab };
      }
    }
  }
  // annex(토론 별관)는 debate 탭과 같은 Studio/Debate로 모은다.
  if (activeSurface.axis === "mode" && activeSurface.mode === "annex") {
    return { section: "studio", tab: "debate" };
  }
  // 매핑되지 않은 표면(예: MODE_OWNS_CENTER_NAV 직후의 과도기)은 Command/Overview로.
  return { section: "command", tab: "overview" };
}

/**
 * 탭 선택 → 기존 상태 변경 의도(순수). App.tsx가 이 값을 받아 기존 setMode /
 * setActiveNavItem 으로 적용한다 — 여기서 직접 상태를 건드리지 않는다.
 *
 * - `activeNavItem` 지정: 좌측축이 중앙을 점유 (config 포함: "config_files").
 * - `mode` 지정 + `activeNavItem: MODE_OWNS_CENTER_NAV`: 상단축이 중앙을 점유.
 */
export type NavigationIntent = { mode?: CenterMode; activeNavItem: NavItemId };

export function navigationIntentForTab(section: AppSection, tab: SectionTab): NavigationIntent {
  const spec = SECTION_TABS[section].find((entry) => entry.tab === tab);
  if (!spec) {
    return { activeNavItem: "dashboard" };
  }
  if ("config" in spec) {
    return { activeNavItem: "config_files" };
  }
  if ("nav" in spec) {
    return { activeNavItem: spec.nav };
  }
  return { mode: spec.mode, activeNavItem: MODE_OWNS_CENTER_NAV };
}

/** 섹션 클릭(대표 탭)에 대한 변경 의도. */
export function navigationIntentForSection(section: AppSection): NavigationIntent {
  return navigationIntentForTab(section, SECTION_DEFAULT_TAB[section]);
}
