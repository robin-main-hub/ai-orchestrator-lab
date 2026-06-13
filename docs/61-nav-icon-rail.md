# 61 — 네비 아이콘 레일 (UX 개선 #6)

전체 네비게이션 인지 부하 지적: 상단 모드 탭 + 좌측 nav + 사이드 패널이 겹치고,
좌측 nav가 텍스트+아이콘으로 폭을 많이 먹는다. 세 가지 요구를 정찰로 검증한 결과,
**둘은 이미 충족돼 있었고** 실질 신규 작업은 아이콘 레일이었다.

## 정찰이 바로잡은 전제 (정직하게)

- **"대화 화면에서 좌측 nav가 240px 낭비"는 현 구조상 발생하지 않는다.** 좌측 레일은
  대화/토론/Tmux/콕핏 집중 셸에서 아예 렌더되지 않고(showLeftRail=false), nav-center
  페이지(dashboard/sessions/projects/…)에서만 264px를 쓴다.
- **모드 탭 ↔ nav "단일 축"은 이미 통합돼 있다.** 디자인 5탄(docs/55)에서 `navSurface`
  (`isNavCenterActive`/`MODE_OWNS_CENTER_NAV="none"`/`resolveActiveSurface`)로 두 축의
  판정·동선을 단일화했다. 정찰 권고대로, 좌측에 모드 그룹을 새로 만들어 **중복**시키기보다
  상단 중앙 pill을 모드의 유일 소스로 유지한다.
- **⌘K는 이미 만능 진입으로 배선·노출돼 있다.** 상단 우측 버튼(Search + ⌘K kbd) +
  전역 토글(useGlobalShortcuts) + 31개 paletteCommands가 작동 중.

## 한 일: 아이콘 온리 레일 (회귀 0)

nav-center 페이지의 264px 텍스트+아이콘 레일을 **56px 아이콘 온리**로. 라벨은 버튼의
`title` 호버 툴팁으로 대체하고, 스크린리더용 `aria-label={item.label}`을 추가해 라벨을
숨겨도 접근성 유지. 활성 보라 인디케이터는 위치만 재계산해 보존.

안전 스코프:
- `.app-shell.nav-center-shell` 그리드 264→56px + `.left-rail:not(.drawer-open)`에만
  아이콘 온리 적용. **모바일 드로어(`.drawer-open`)와 provider/admin 레일(일반 셸)은
  라벨 그대로** — 좁은 화면·등록 흐름에서 라벨이 사라지지 않는다.
- ChevronRight는 `.nav-item svg ~ svg`로만 숨겨(비활성 항목의 단일 아이콘은 영향 없음).

## 원칙

- **전제부터 검증**: 사용자가 든 근거(대화 240px)가 실제와 다르면 정직하게 짚고,
  이미 된 것(축 통합·⌘K)은 다시 만들지 않는다.
- **콘텐츠에 폭을 양보**: 관리 페이지에서 264→56px로 본문이 넓어진다.
- **회귀 0·a11y 보존**: title 툴팁 + aria-label, 모바일/등록 레일 라벨 유지.
  typecheck·빌드·전체 1118 그린.

## 다음

#7 마이크로 인터랙션(입벌림·도장·시선선) — 기능 완성 후 폴리시.
