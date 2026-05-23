# 에이전트 오케스트레이션

## 에이전트 종류

### 실제 에이전트

터미널이나 CLI를 통해 실제 작업을 수행하는 에이전트다.

- Claude Code
- Codex
- OpenCode
- 커스텀 CLI
- 로컬 스크립트 실행자

### 가상 에이전트

하나의 API 또는 하나의 모델을 여러 역할로 나누어 실행한다.

예시 역할:

- Architect: 구조 설계
- Builder: 구현 계획과 코드 작성
- Reviewer: 결함과 누락 탐지
- Skeptic: 반대 논리와 실패 시나리오 제시
- Verifier: 최종 검증
- Memory Curator: 필요한 기억 검색과 저장 판단

## 토론 모드

토론은 단순 채팅이 아니라 구조화된 라운드다.

1. 문제 정의
2. 각 에이전트의 1차 제안
3. 상호 비판
4. 오케스트레이터 요약
5. 보완 라운드
6. 최종 결정
7. 코딩 전달 패킷 생성

## 코딩 전달 패킷

토론 결과를 코딩으로 넘길 때는 자연어 요약만 보내지 않는다. 다음 구조를 사용한다.

```ts
export type CodingPacket = {
  goal: string;
  context: string[];
  decisions: string[];
  rejectedOptions: string[];
  constraints: string[];
  filesToInspect: string[];
  implementationPlan: string[];
  verificationPlan: string[];
  reviewerNotes: string[];
};
```

## 실행 슬롯

프론트엔드에는 여러 실행 슬롯이 있어야 한다.

- 토론 슬롯
- 코딩 슬롯
- 리뷰 슬롯
- 검증 슬롯
- 터미널 슬롯
- 메모리 슬롯

각 슬롯은 독립적으로 실행되지만, 오케스트레이터가 전체 세션 ID로 묶는다.

## 검증 전략

검증은 두 방식 모두 지원한다.

- 강한 모델 검증: 비용은 크지만 최종 품질이 중요할 때 사용
- 동일 로컬 모델 검증: 서버가 없거나 비용을 줄이고 싶을 때 사용

검증자는 구현자와 같은 모델이어도 프롬프트, 역할, temperature, 컨텍스트를 다르게 둔다.
