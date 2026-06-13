# 62 — 마이크로 인터랙션 (UX 개선 #7)

캐릭터 OS 느낌을 강화하는 폴리시. 기존 자산(표정 스프라이트·stamp-slam 키프레임)을
재사용해 회귀 0으로 두 가지를 더했다.

## 한 일 (회귀 0)

- **응답 중 아바타 speaking 펄스**: 대화 스포트라이트(docs/56)의 초상화가 에이전트가
  능동 작업 중(responding/preparing/tooling/capturing/dispatching/testing)일 때 부드러운
  보라 링 펄스(`conversation-speaking`)로 살아있다. `isSpeakingActivity`(순수·테스트)로
  판정 — 승인 대기·에러·idle은 정지(가짜 생동감 없음). `prefers-reduced-motion`에서
  애니메이션 차단.
- **큐 비움 도장(slam-in)**: Control Queue를 다 처리하면 "대기 중인 항목 없음" 옆에
  `result-stamp result-stamp-success` "처리 완료" 도장이 stamp-slam으로 찍힌다. 자율
  실행에만 쓰이던 도장 인프라(ResultStamp/stamp-slam)를 승인 완료 자리에 재사용.
  resolvedCount > 0(실제 처리분이 있을 때)만 — 거짓 도장 없음.

## 안 한 일 (정직하게)

- **에이전트 간 위임 시선 연결선**: 정찰 결과 위임 카드(MakimaDelegationConsole·
  HandoffCard)는 아바타 화면 좌표를 갖고 있지 않아, 두 아바타를 잇는 선을 그리려면
  레이아웃 측정/포지셔닝 인프라를 새로 깔아야 한다. 폴리시 항목 치고 비용·위험이
  커 이번엔 보류한다.

## 원칙

- **기존 자산 재사용**: speaking 표정 개념·stamp-slam 키프레임을 새로 만들지 않고 연결.
- **거짓말하지 않는다**: 실제 활동 상태에서만 펄스, 실제 처리분이 있을 때만 도장.
- **접근성**: reduced-motion 가드. 회귀 0 — 순수 헬퍼+클래스 토글, typecheck·빌드·
  전체 1122 그린.

## UX 개선 시리즈 (docs/56–62)

56 대화 에이전트 레일 · 57 승인 드로어 단순화 · 58 대시보드 도감 접기 · 59 콕핏 타일
정리 · 60 Tmux 2열 · 61 네비 아이콘 레일 · 62 마이크로 인터랙션. 전체 워크스루 7개
지적을 우선순위대로 회귀 0으로 반영.
