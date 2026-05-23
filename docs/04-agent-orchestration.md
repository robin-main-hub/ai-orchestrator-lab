# 에이전트 오케스트레이션

## 에이전트 종류

### 실제 에이전트

터미널이나 CLI를 통해 실제 작업을 수행하는 에이전트다.

- Claude Code
- Codex
- OpenCode
- 커스텀 CLI
- 로컬 스크립트 실행자

### 계층형 에이전트

제품이 커지면 다음 계층을 사용한다.

- Orchestrator: 상위 관리자. 작업 분배, 승인 요청, 사용자 보고
- Worker: 실무 실행자. 대화, 코딩 패킷, 제한된 실행 준비
- External Agent: Telegram/API/webhook 담당. read-only 중심, 위험 도구 차단
- Auditor: 로그와 병목을 분석하는 read-only 개선 제안자

v0에서는 Orchestrator와 Worker만 필수다. External Agent와 Auditor는 외부 채널과 운영 자동화가 붙을 때 활성화한다.

### 가상 에이전트

하나의 API 또는 하나의 모델을 여러 역할로 나누어 실행한다.

예시 역할:

- Architect: 구조 설계
- Builder: 구현 계획과 코드 작성
- Reviewer: 결함과 누락 탐지
- Skeptic: 반대 논리와 실패 시나리오 제시
- Verifier: 최종 검증
- Memory Curator: 필요한 기억 검색과 저장 판단

가상 에이전트의 합의는 독립적인 다수결이 아니다. 같은 모델과 같은 provider에서 만든 에이전트들은 같은 사각지대와 편향을 공유할 수 있다. 따라서 UI와 결과 요약에서는 `합의`를 "독립 검증 완료"로 표현하지 않고, "역할 기반 합의"로 표시한다. 중요한 결정은 다른 provider, 강한 검증 모델, 또는 로컬/원격 교차 검증을 선택할 수 있어야 한다.

## Agent Soul

일부 에이전트는 `soul.md`를 가질 수 있다. soul은 해당 에이전트의 장기 정체성, 판단 기준, 말투, 금기, 작업 취향을 담는 파일이다.

모든 에이전트에게 soul을 주입하지는 않는다. 오케스트레이터, 설계자, 리뷰어, 회의 진행자, 메모리 관리자처럼 일관된 성향이 중요한 에이전트에 우선 적용한다. 단순 실행자나 짧은 작업 에이전트는 soul 없이 가볍게 실행할 수 있어야 한다.

Soul 주입 모드:

- Full: soul 전체를 주입한다.
- Summary: soul 요약본만 주입한다.
- Retrieved: 현재 작업과 관련된 soul 섹션만 검색해 주입한다.
- Off: soul을 사용하지 않는다.

Soul은 Memento 메모리와 다르다. soul은 에이전트의 정체성이고, Memento는 세션에서 배운 경험과 기억이다.

프롬프트 조립 순서는 다음을 기본으로 한다.

1. 시스템 안전 규칙
2. 에이전트 역할
3. soul 요약 또는 관련 섹션
4. 프로젝트 컨텍스트
5. Memento recall 결과
6. 현재 작업 지시
7. 출력 형식

자세한 설계는 `docs/09-agent-soul.md`에 둔다.

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

프론트엔드에는 여러 실행 슬롯이 있어야 한다. 다만 기본 화면에서 모든 슬롯을 동시에 노출하지 않는다. v0는 대화, 코딩, 기록/터미널 중심의 2~3개 슬롯만 보이고, 토론/리뷰/검증/메모리 슬롯은 필요할 때 펼친다.

- 토론 슬롯
- 코딩 슬롯
- 리뷰 슬롯
- 검증 슬롯
- 터미널 슬롯
- 메모리 슬롯

각 슬롯은 독립적으로 실행되지만, 오케스트레이터가 전체 세션 ID로 묶는다.

## 비공개 세션 통신과 Human Peek

에이전트 간 지시와 결과 보고는 공개 채널 대신 세션 이벤트로 기록한다.

- `sessions.spawn`: 하위 에이전트 세션 생성
- `sessions.send`: 기존 세션으로 메시지 전달
- `sessions.yield`: 결과, 승인, 이벤트를 기다림

비공개 세션은 블랙박스가 되기 쉽기 때문에 Human Peek 패널에서 세션 트리, 지시, 응답, approval 상태를 볼 수 있어야 한다.

자세한 외부 채널과 세션 통신 설계는 `docs/15-agent-topology-and-ingress-guards.md`에 둔다.

## 기록 보기와 재실행

실행 기록은 두 가지 기능으로 분리한다.

- Record View: 당시 입력, 출력, 모델, 비용, 권한, memory trace를 그대로 본다.
- Re-run: 같은 입력 또는 수정된 입력으로 새 실행을 만든다. LLM 결과는 비결정적일 수 있으므로 원 실행을 재현한다고 표현하지 않는다.

## 검증 전략

검증은 두 방식 모두 지원한다.

- 강한 모델 검증: 비용은 크지만 최종 품질이 중요할 때 사용
- 동일 로컬 모델 검증: 서버가 없거나 비용을 줄이고 싶을 때 사용

검증자는 구현자와 같은 모델이어도 프롬프트, 역할, temperature, 컨텍스트를 다르게 둔다.
