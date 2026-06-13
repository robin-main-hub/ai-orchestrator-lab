# 55 — 네비 축 통합 (디자인 정리 5탄, 마지막)

디자인 리뷰에서 가장 근본으로 지적된 곳: 네비게이션이 두 좌표축으로 갈려 있다 —
상단 `mode`(CenterMode 5: 대화/토론/Tmux/콕핏/annex)와 좌측 `activeNavItem`
(NavItemId). 사용자가 두 축을 머릿속에 동시에 들고 있어야 했다. 전 화면이
`mode`/`navCenterActive`에 의존해 blast radius가 커, 가장 마지막·고위험으로 미뤘다.

## 회귀 0을 지키며 할 수 있는 만큼

라우터·딥링크가 전혀 없고(순수 useState + mode만 localStorage) 외부 마이그레이션
위험은 낮지만, 두 useState를 단일 union state로 한 번에 갈아엎는 것은 center-board
14분기 + shellVisibility + railLayout + app-shell className이 모두 걸려 회귀 위험이
크다. 그래서 **두 useState는 유지하되**, 정찰이 권고한 안전한 통합부터 정확히:

1. **유령 좌표 제거** — `activeNavItem === "runtime"`은 `navCenterActive` 조건과
   타입에만 있고, nav 항목도 center-board 렌더 분기도 없으며 아무도 그 값을 세팅하지
   않는 도달 불가 좌표였다. `NavItemId`에서, 그리고 판정 집합에서 제거.

2. **목적지 불일치(실제 버그) 수정** — mode가 중앙을 가져갈 때 nav를 비우는 센티넬이
   두 곳에서 갈렸다: 탭 클릭(onChangeMode)은 `"none"`, mode 변경 effect는
   `"sessions"`. effect의 `"sessions"`는 그 자신 주석("mode에 중앙을 넘긴다")과
   모순 — `"sessions"`는 nav를 유지하는 값이라, 명령 팔레트로 mode를 바꾸면 의도한
   화면 대신 **세션 페이지**가 뜨곤 했다. 두 곳을 단일 센티넬
   `MODE_OWNS_CENTER_NAV = "none"`으로 통일.

3. **단일 좌표 어댑터** — `lib/navSurface.ts`(순수, 테스트됨):
   - `NAV_CENTER_ITEMS` — 중앙을 점유하는 nav 목록을 한 곳에 정의(App.tsx의 인라인
     `||` 체인 대체).
   - `isNavCenterActive(activeNavItem)` — '어느 축이 중앙인가' 판정의 단일 출처.
   - `resolveActiveSurface({mode, activeNavItem})` → `{axis:"nav"|"mode", …}` —
     두 축을 하나의 값으로 읽는 단일 좌표. 아직 두 state를 대체하진 않지만, 이후
     완전 통합(activeSurface 단일 소스)으로 가는 어댑터이자 그 모델의 테스트 지점.

## 남긴 것 (정직하게)

완전한 단일 union state(상단 5 + 좌측 10을 하나의 `activeSurface`로 치환하고
navCenterActive/effect/onChangeMode를 derived getter로 교체)는 **하지 않았다**.
전 화면 의존이라 한 번에 가면 1098 그린을 위협한다. navSurface가 그 단일 모델을
이미 순수 함수로 정의해 두었으니, 다음 단계에서 점진적으로 state를 그쪽으로 옮기면
된다 — 이번 패스는 유령 제거 + 동선 버그 수정 + 판정 일원화까지.

## 원칙

- **단일 출처**: '중앙 점유 nav 목록'과 판정을 인라인 체인에서 lib로.
- **거짓말하지 않는다(동선)**: 같은 의미(mode가 중앙)는 어디서든 같은 센티넬. 팔레트
  전환이 엉뚱한 페이지로 새던 버그 제거.
- **회귀 0·점진**: 두 useState 유지, 위험한 일괄 치환은 미루고 어댑터로 길을 냄.
  typecheck·프로덕션 빌드 통과, desktop 1098 그린.

## 디자인 정리 시리즈 (docs/51–55)

51 콕핏 3단계 드릴다운 · 52 대시보드 "다음 할 일" · 53 액션 동선 일관화 ·
54 여백·밀도 패스 · 55 네비 축 통합. 디자인 AI가 짚은 5개 문제(정보 과부하·계층
부재·네비 복잡도·액션 동선 단절·밀도)를 화면별로 회귀 0으로 정리.
