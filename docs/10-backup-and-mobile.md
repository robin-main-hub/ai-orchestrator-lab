# 백업과 모바일 접근

## 목표

토론 결과, 실행 기록, 결정 로그를 사용자가 나중에 쉽게 읽고 추적할 수 있게 Obsidian과 Notion으로 자동 백업한다. 폰에서는 전체 오케스트레이터를 위험하게 직접 조작하기보다, 기록 확인과 제한적 승인/중단 중심으로 접근한다.

## 원본 저장소 원칙

Notion이나 Obsidian을 원본으로 두지 않는다. DGX-02 Event Store가 중앙 원본이고, 맥북/집 PC의 로컬 SQLite는 offline cache/outbox다. Obsidian/Notion은 export projection이다.

```text
Event Store
  -> Session Log
  -> Debate Transcript
  -> Decision Record
  -> Coding Packet
  -> Run Artifact
  -> Memory Trace
       -> Obsidian Exporter
       -> Notion Exporter
       -> Mobile Dashboard
```

## Obsidian 백업

Obsidian은 맥북 로컬 vault에 Markdown 파일로 남긴다.

```text
AI-Orchestrator/
  projects/
    ai-orchestrator-lab/
      sessions/
        2026-05-23-session-title.md
      decisions/
        ADR-0001-provider-profile-design.md
      runs/
        run-20260523-2142.md
      debates/
        debate-20260523-model-routing.md
```

Obsidian 백업은 Offline에서도 동작해야 한다. 서버가 없어도 맥북 로컬 파일로 남길 수 있기 때문이다.

## Notion 백업

Notion은 사람이 보기 좋은 데이터베이스로 사용한다.

추천 DB:

- Sessions
- Decisions
- Runs
- Agents
- Model Profiles

Notion에는 긴 raw log 전체보다 요약, 핵심 결정, 링크, 상태, 태그를 우선 저장한다. 원문 로그는 앱 event store 또는 Obsidian 파일에 둔다.

## 모바일 접근

폰에서는 다음 순서로 기능을 제공한다.

1. Obsidian/Notion으로 기록 읽기
2. 모바일 웹/PWA로 세션 상태 보기
3. 승인, 중단, 재시도 같은 제한적 제어
4. 필요할 때만 전체 원격 조작

## 폰에서 가능한 기능

- 현재 실행 중인 세션 보기
- 모델/에이전트 상태 확인
- 토론 결과 읽기
- 코딩 전달 패킷 승인
- 검증 실행 요청
- 위험한 실행 중단
- 완료 알림 받기

## 폰에서 제한할 기능

- 터미널 직접 입력
- 파일 삭제/이동 같은 위험 명령
- API 키 원문 보기
- 권한이 큰 원격 명령 실행
- 검증 없이 자동 merge/push

## Redaction Layer

민감정보 제거는 외부 백업 직전에만 수행하지 않는다. 모든 이벤트는 Event Store에 저장되기 전, event emit 단계에서 Redaction Layer를 통과한다. Obsidian/Notion exporter는 이미 정제된 이벤트만 읽는다.

- API key 제거
- bearer token 제거
- auth token 제거
- `.env` 값 제거
- 필요 시 base URL 마스킹
- raw terminal log의 민감한 줄 제거

자세한 규칙은 `docs/13-event-store-permission-redaction.md`에 둔다.

## Offline Queue

Notion이나 모바일 서버가 꺼져 있으면 export 작업은 큐에 쌓는다.

1. Event Store에 redacted event 저장
2. Obsidian 로컬 export 시도
3. Notion export 실패 시 pending queue에 저장
4. 연결 복구 후 재시도
5. 성공/실패 상태를 세션에 표시

## 결론

Obsidian은 맥북의 장기 작업 노트이고, Notion은 사람이 보기 좋은 대시보드이며, 모바일은 읽기와 승인 중심의 얇은 제어판이다. 이 세 가지를 원본 저장소가 아니라 Event Store의 파생 뷰로 다루면 기록 안정성과 확장성을 둘 다 얻을 수 있다.
