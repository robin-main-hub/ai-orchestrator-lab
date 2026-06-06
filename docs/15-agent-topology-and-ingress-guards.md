# 에이전트 토폴로지와 Ingress Guard

## 출처와 적용 범위

이 문서는 Gemini가 정리한 GPTers/OpenClaw 계열 오케스트레이션 레퍼런스를 우리 프로젝트에 맞게 재해석한 것이다. 해당 외부 사례의 사실관계는 별도 검증하지 않았으며, 여기서는 설계 패턴으로만 사용한다.

우리 제품은 개인용 데스크톱 오케스트레이터가 중심이다. 따라서 기업 CS 파이프라인, Linear 강제 SSOT, ChannelTalk 전용 흐름을 그대로 복제하지 않는다. 대신 다음 패턴만 채택한다.

- 상위/하위/외부/감사 에이전트 토폴로지
- 에이전트별 agentDir/workspace 격리
- 비공개 세션 통신과 Human Peek
- 외부 유입 요청용 Ingress Guard
- confidence 기반 자동/승인 라우팅
- 0-token safety cron

## 에이전트 토폴로지

| 계층 | 우리 시스템 이름 | 역할 | 기본 권한 |
| --- | --- | --- | --- |
| 상위 관리자 | Orchestrator | 작업 분배, 검토, 승인 요청, 사용자 보고 | 세션 생성, 하위 에이전트 지시, 승인 요청 생성 |
| 실무 실행자 | Worker / Builder | 대화형 작업, 코딩 패킷 생성, 도구 실행 준비 | 제한된 파일/터미널 작업, 실행 전 승인 필요 |
| 외부 채널 담당 | External Agent | external API/CS 등 외부 입력 처리 | 읽기 중심, write/exec/browser 기본 차단 |
| 감사/개선 담당 | Auditor | 실행 로그 분석, 병목 탐지, 자동화 후보 제안 | read-only analytics |

이 구조는 제품의 기본 흐름을 바꾸지 않는다. v0에서는 `Orchestrator + Worker`만 필수이고, `External Agent`와 `Auditor`는 외부 채널/운영 자동화가 붙을 때 활성화한다.

## Agent Directory 격리

각 에이전트는 독립된 상태 디렉터리와 작업 공간을 가진다.

```text
agents/
  orchestrator/
    SOUL.md
    AGENTS.md
    skills/
    state/
  worker/
    SOUL.md
    AGENTS.md
    skills/
    state/
  external/
    SOUL.md
    AGENTS.md
    skills/
    state/
  auditor/
    AGENTS.md
    skills/
    state/
workspaces/
  orchestrator/
  worker/
  external/
  auditor/
```

격리 원칙:

- 에이전트별 auth profile과 provider profile은 공유하지 않는다.
- External Agent는 secret 조회, exec, write, browser를 기본 denied로 둔다.
- Worker는 직접 mutation하기 전에 Orchestrator 또는 사용자 approval을 요구한다.
- Auditor는 read-only event projection만 읽는다.

## SOUL, AGENTS, SKILL 우선순위

역할 파일을 분리한다.

| 파일 | 역할 |
| --- | --- |
| `SOUL.md` | 말투, 경계, 판단 기준, 장기 정체성 |
| `AGENTS.md` | 도구 권한, 실행 정책, 모델 선택, 운영 지침 |
| `SKILL.md` | 특정 작업 능력과 절차 |

스킬 로드 우선순위:

1. 워크스페이스 스킬
2. 프로젝트 에이전트 스킬
3. 개인 에이전트 스킬
4. 전역 managed 스킬

동일 이름 스킬이 여러 위치에 있으면 위 순서대로 override한다. 이 우선순위는 Event Store에 기록되어 재현 가능해야 한다.

## 비공개 세션 통신

에이전트 간 통신은 공개 채널을 더럽히지 않도록 세션 기반으로 처리한다.

```ts
type SessionCommand =
  | { type: "sessions.spawn"; parentSessionId: string; targetAgentId: string; task: string }
  | { type: "sessions.send"; sessionId: string; message: string; timeoutSeconds?: number }
  | { type: "sessions.yield"; sessionId: string; waitFor: "result" | "approval" | "event" };
```

운영 방식:

- 결과가 필요한 작업은 `sessions.yield`로 기다린다.
- 단순 알림/비동기 지시는 `timeoutSeconds: 0`으로 fire-and-forget한다.
- 모든 세션 명령은 Event Store에 기록한다.
- Human Peek 패널에서 비공개 세션의 지시와 응답을 볼 수 있어야 한다.

## Human Peek

Human Peek는 숨은 에이전트 대화를 사람이 들여다보는 관찰 패널이다.

보여줄 것:

- 세션 트리
- 상위/하위 에이전트 지시
- 하위 에이전트 결과
- approval pending 상태
- 사용된 provider/model
- redaction/permission/trust 상태

Human Peek는 기본 작업 화면을 어지럽히지 않도록 on-demand 패널로 둔다.

## Ingress Guard

외부 입력은 절대 에이전트에 직접 연결하지 않는다. external, mobile, API, webhook, 향후 ChannelTalk/Slack 같은 외부 채널은 Ingress Guard를 먼저 통과한다.

```text
External Channel
  -> Proxy / Webhook Receiver
  -> Ingress Guard Pipeline
  -> Event Store
  -> External Agent or Conversation Session
  -> Approval / Response
```

## 7단계 Guard

Gemini가 제시한 7중 변환 가드는 우리 시스템에서 다음처럼 일반화한다.

| 순서 | Guard | 역할 | 기본 결과 |
| --- | --- | --- | --- |
| 1 | Shape Unification | 채널별 payload를 표준 event input으로 변환 | normalized input |
| 2 | Noise Filter | 열람 이벤트, 봇 이벤트, 시스템 알림 제거 | early return |
| 3 | Self-Response Prevention | 자기 응답/봇 루프 차단 | blocked |
| 4 | Debounce | 짧은 시간 내 연속 메시지 병합 | merged input |
| 5 | PII/Secret Block | 비인증 개인정보/secret 요청 차단 | pending/denied |
| 6 | Guard Logging | raw quarantine log와 redacted event 분리 저장 | audit trail |
| 7 | Checklist Injection | 채널별 확인 절차와 SSOT 링크 주입 | guarded prompt |

주의: Guard Logging은 원본을 "무차별 영구 저장"하지 않는다. 원본 payload는 필요할 때만 암호화된 quarantine log에 제한 보존하고, 일반 Event Store에는 redacted event만 저장한다.

## Confidence Routing

외부 응답은 confidence에 따라 라우팅한다.

| confidence | 처리 |
| --- | --- |
| HIGH | SSOT 근거가 명확하고 권한 위험이 낮으면 자동 응답 가능 |
| MEDIUM | 초안 생성 후 사용자가 빠르게 승인 |
| LOW | 자동 응답 금지. 내부 검토/승인 대기 |

민감 주제 예시:

- 결제/환불
- 개인정보
- 계정 접근
- 파일/터미널 실행
- 장기 메모리 저장

이 항목은 기본 LOW 또는 pending approval이다.

## 0-Token Safety Cron

모델이 실패해도 시스템이 조용히 놓치지 않도록 비-AI 안전망을 둔다.

예시:

- 3시간마다 pending external inquiry 검사
- 상태 마킹 없는 요청 탐지
- 실패한 exporter 재시도
- stuck run 감지
- 사용자에게 누락 알림

이 로직은 LLM 없이 동작해야 하며, Bash/Python/Node script 또는 서버 cron으로 실행할 수 있다.

## SSOT 정책

Linear를 강제하지 않는다. 사용자가 선택한 SSOT provider를 프로젝트별로 설정한다.

가능한 SSOT:

- 로컬 Markdown
- GitHub Issues/Projects
- Notion
- Linear
- Obsidian vault
- 커스텀 API

외부 응답이나 자동 실행 전에는 해당 프로젝트의 SSOT snapshot을 조회하고, snapshot id를 Event Store에 기록한다.

## 네트워크와 도구 보안

기본 정책:

- 외부 에이전트는 `exec`, `write`, `browser`, `secret` 기본 denied
- mDNS/service discovery는 기본 off
- custom provider는 memory recall 자동 차단
- model failover는 가능하지만 trust level과 permission을 유지
- 모델 라우팅은 cheap classifier와 strong reviewer를 분리 가능

## v0 적용 범위

v0에서 바로 구현할 것:

- 표준 IngressEvent 스키마
- Shape Unification
- Noise Filter
- Self-Response Prevention
- Redaction/Permission 연결
- Guard 적용 로그

## Stage8 구현 경계

현재 구현은 실제 외부 인입 API나 OpenClaw 세션 연결 전에, 외부 입력이 앱 내부 세션으로 들어오는 보안 경계를 먼저 고정한다.

- `IngressEvent`는 channel, source trust, author type, normalized/redacted text, requested permissions, confidence를 가진다.
- `IngressGuardResult`는 7단계 guard의 pass/queued/blocked 상태와 approval state를 기록한다.
- 외부 인입/OpenClaw demo input은 Event Store에 들어가기 전에 secret/env 값을 redaction하고 `sourceTrust: untrusted`로 표시한다.
- 외부 입력의 원문 payload는 일반 Event Store에 그대로 남기지 않고 `rawText: [QUARANTINED_RAW_PAYLOAD]`로 격리한다.
- 짧은 시간 안에 연달아 들어온 외부 snippet은 `recentTexts`와 함께 debounce window에서 하나의 normalized text로 병합한다.
- terminal/write/secret 요청은 `ExternalApprovalItem`으로 approval queue에 들어간다.
- self-response/bot reply는 세션 handoff 전에 차단한다.
- Conversation Workbench의 `External Ingress` 버튼은 guarded external message를 현재 세션에 추가하고, untrusted memory candidate로 격리한다.
- Ingress Guard 패널은 confidence, approval, guard steps, approval queue, 0-token safety pending count를 보여준다.

v0 이후:

- Debounce
- Confidence Routing
- Human Peek
- 0-token safety cron
- External Agent 전용 workspace
- SSOT provider 확장

## 결론

외부 채널은 제품을 강력하게 만들지만, 동시에 가장 위험한 입력 경로다. 따라서 외부 채널은 대화 기능보다 낮은 권한으로 시작하고, Ingress Guard와 trust policy를 통과한 뒤에만 오케스트레이터의 나머지 기능과 연결한다.
