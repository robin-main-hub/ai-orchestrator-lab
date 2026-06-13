# 52 — 대시보드 "다음 할 일 1개" (디자인 정리 2탄)

디자인 리뷰 방향 중 하나: 대시보드를 "정보/쇼케이스 나열"이 아니라 "지금 할 일
하나"로 시작하게 한다. 기존 대시보드(`DashboardView`)는 페르소나 쇼케이스 +
도감 18인 + 작전 타일 5개 + 최근 기록을 같은 무게로 나열해, 운영자가 "그래서
지금 뭘?"을 첫 화면에서 못 찾았다.

## 한 줄 + 액션 하나를 맨 위로 (기능 회귀 0)

콕핏 L1(docs/51)이 쓰는 바로 그 신호를 대시보드 첫 블록으로 재사용한다:

```text
[● 주의 필요  차단 1 · 승인 2]      ← 건강 한 줄 (red/yellow/green)
워커 1건 차단 — 즉시 확인            ← headline (무엇을)
[ 차단 원인 보기 → ]                ← topAction CTA (어디서 처리)
```

- `deriveCockpitHealthFromSnapshot(snapshot, nextActions)` (신규, 순수): 콕핏과
  대시보드가 **동일한 신호 도출을 공유**하도록 snapshot→rollup 매핑을 한 곳에
  모았다. 두 화면이 같은 상태에서 같은 red/yellow/green을 말한다. 콕핏
  `OperatorCockpit`도 이 헬퍼로 전환 — 인라인 카운트 중복 제거, 파리티 보장.
- App은 이미 계산된 `cockpitSnapshot` + `cockpitReadiness.nextActions`로
  `dashboardHealthRollup`을 `useMemo`로 만들어 `DashboardView`에 넘긴다. 새 데이터
  파이프라인 없음.
- `DashboardView`는 최상단에 `dashboard__next` 블록을 BEM(글래스 디자인 언어)으로
  그린다 — 콕핏 히어로(Tailwind)와 톤이 다르므로 컴포넌트를 이식하지 않고 순수
  로직만 공유.

## 액션 동선도 한 패턴으로

`handleDashboardNextAction`: topAction의 `targetSurface`가 승인성(approvals /
control_queue)이면 **제자리**에서 Control Queue 드로어를 열고, 그 외(fleet /
diagnostics / maturity / receipts …)는 상세가 사는 **콕핏**으로 보낸다. 대시보드
→ 콕핏 → 처리로 동선이 한 방향으로 모인다 (3탄 액션 동선 일관화의 선행 패턴).

## 원칙

- **정보 나열 → 다음 행동**: 첫 블록이 "괜찮은가 / 뭘 해야 하나" 한 줄 + 액션 하나.
  쇼케이스·도감·타일은 그 아래 그대로(강등, 삭제 아님).
- **거짓말하지 않는다**: 건강 신호는 실제 snapshot(차단/승인/폴백/미러)에서 도출.
  `healthRollup`이 없으면 블록 자체를 그리지 않음 — 가짜 green 없음.
- **회귀 0**: prop은 모두 optional, 기존 대시보드 마크업은 그대로. 새 블록/헬퍼는
  단위 테스트로 분리 검증. desktop 스위트 1094 그린.

## 다음 디자인 타깃

액션 동선 일관화(승인 진입 prop 네이밍·배지 카운트 단일화), 여백·밀도 패스
(spacing 토큰 신설), 그리고 가장 근본인 네비 축 통합(상단 5 + 좌측 12)은 마지막.
