# 56 — 대화 에이전트 레일 + 표정 스포트라이트 (UX 개선 #1)

전체 앱 워크스루에서 가장 먼저 지적된 곳: 가장 오래 머무는 대화 워크벤치인데
에이전트 전환이 팝오버 안에 숨어 2클릭이고, "지금 누구와 대화 중인지"가 헤더 작은
글씨로만 보인다. 캐릭터 OS의 핵심 차별점인 표정 피드백이 묻혀 있었다.

## 세 가지 (회귀 0)

1. **좌측 에이전트 세로 레일** (`ConversationAgentRail`, Discord 패턴) — 18 에이전트를
   1클릭 전환. 활성 에이전트는 좌측 보라 필 + ring. 활동 상태 도트로 "손이 필요한"
   에이전트 표시(승인 대기=amber, 막힘=red, 작업 중=pulse). 진짜 미읽음 추적은 데이터
   모델에 없어 — **가짜 카운트 대신 실제 활동 상태**를 도트로 쓴다(거짓말하지 않는다).
2. **상단 표정 스포트라이트** (`ConversationAgentSpotlight`) — 현재 에이전트의 표정
   스프라이트를 크게. 활동 상태에 맞는 감정(응답=joy, 도구=curiosity, 승인대기=
   nervousness, 막힘=disappointment, idle=neutral)을 보여줘 "지금 어떤 상태로 대화
   중인지"가 한눈에. 308장 스프라이트(11 페르소나 × 28 감정) 번들을 실제로 사용.
3. **추천칩을 입력창 바로 위 고정** — Composer엔 이미 입력창 위 칩 렌더가 있었는데
   `promptSuggestions={undefined}`로 꺼져 있었다. 계산돼 있던 `promptSuggestions`를
   넘기기만 하면 스크롤 없이 항상 보인다.

## 단일 소스 헬퍼

`lib/conversationAgentPortrait.ts`(순수·테스트): `personaSlugForAgent`(personaName ??
role, R2 1:1 규약), `expressionForActivity`(활동→감정), `resolveAgentExpressionPortrait`
(스포트라이트: 표정 우선), `resolveAgentIdentityAvatar`(레일: 정체성 안정). 표정/아바타
모두 없으면 이니셜 폴백 — 가짜 표정 없음. 레일 아바타는 기존 `AvatarWithStatus`
프리미티브 + `roleColorFromRole` 재사용.

## 원칙

- **마찰 제거**: 2클릭 팝오버 전환 → 1클릭 레일.
- **캐릭터 OS 차별점 부각**: 묻혀 있던 표정 스프라이트를 대화 상단으로.
- **거짓말하지 않는다**: 미읽음이 없으면 활동 상태로, 표정이 없으면 폴백.
- **회귀 0**: 기존 헤더 팝오버 전환도 그대로(레일은 추가), 추천칩은 기존 Composer
  렌더 재사용. typecheck·프로덕션 빌드 통과, desktop 1112 그린(+14).

## 다음 (추천 우선순위)

#2 승인 드로어 단순화(6버튼→1+더보기) · #3 대시보드 도감 접기 · #4 콕핏 타일 정리 ·
#5 Tmux 2열 · #6 네비 아이콘 레일 · #7 마이크로 인터랙션.
