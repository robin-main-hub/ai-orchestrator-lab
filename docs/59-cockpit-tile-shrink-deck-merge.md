# 59 — 콕핏 타일 축소 + 지휘판·다음할일 병합 (UX 개선 #4)

L1 히어로(docs/51)를 추가했어도, 펼치면 GlanceTile 4개 → MissionCommandDeck →
NextActionStrip → … 카드가 한 스크롤에 쏟아졌다. 특히 "다음 할 일"을 지휘판 제목과
NextActionStrip 두 군데서 말해 혼란이었다.

## 두 가지 정리 (회귀 0)

- **GlanceTile 축소**: `p-3` + 4줄(label/value/hint/actionLabel) → `px-3 py-2` + 2줄
  (label·icon / value·hint 인라인)로. 액션 라벨은 `title`로 옮겨 라이브 숫자만 남긴
  얇은 타일. 높이가 절반 가까이 준다.
- **MissionCommandDeck + NextActionStrip 병합**: 둘 다 `nextActions[0]`을 말하던
  중복을 제거. 지휘판이 nextAction을 그대로 반복하던 `<h2>`를 없애고, 그 자리에
  NextActionStrip("지금 할 일" + 후보)을 **흡수**해 좌측 = 행동, 우측 = 메트릭(승인·
  워커·기억·성과·차단)의 한 카드로. 독립 NextActionStrip 렌더는 제거. "지금 할 일"을
  한 군데서만 말한다.

## 섹터 드릴인은 이미 동작 (정직하게)

"각 타일 클릭 → 해당 섹터" 요구는 이미 GlanceTile/메트릭 onClick이
`openFleet`/`openApprovals`/… → `detailFocus` + `showDetails` + `scrollIntoView`로
해당 L3 섹터를 포커스(ring 강조)하도록 동작한다. L3 "작전 세부 정보"를 N개 독립
아코디언으로 전면 재작성하는 것은 deep-link 3상태(expanded/showDetails/detailFocus)
+ `cockpit-section-{surface}` 스크롤 타깃 + ring 로직에 회귀 위험이 커, 이번엔 타일→
섹터 포커스(기존 동작)를 유지했다. 전면 아코디언화는 별도 후속으로 남긴다.

## 원칙

- **라이브 숫자만**: 타일은 한눈 숫자로 얇게.
- **한 목소리**: 다음 할 일은 지휘판 안에서 한 번만.
- **회귀 0**: 테스트가 검사하는 모든 문구(작전 지휘판·작업 흐름·지금 할 일·다른 후보·
  메트릭 라벨) 보존. 병합으로 중복 h2가 사라졌음을 새 테스트로 검증. desktop 1118
  그린(+1), 프로덕션 빌드 통과.

## 다음

#5 Tmux 2열 그리드 · #6 네비 아이콘 레일 · #7 마이크로 인터랙션.
