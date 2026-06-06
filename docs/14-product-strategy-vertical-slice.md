# 제품 전략과 수직 슬라이스

## 답해야 할 질문

이 프로젝트는 "쓰려고" 짓는가, "배우려고" 짓는가?

답은 명확하다.

**쓰려고 만든다. 학습은 수단이다.**

따라서 구현 전략은 최종 범위를 포기하는 것이 아니라, 매일 사용할 수 있는 작업 흐름을 먼저 관통시키는 방식이어야 한다.

## 범위 원칙

최종 제품 범위는 유지한다.

- Conversation Workbench
- Debate Mode
- Coding Handoff
- Provider Profiles
- Local Fallback
- DGX Server
- Memento Memory
- Agent Soul
- Obsidian/Notion Backup
- 외부 인입/Mobile

하지만 구현은 넓게 동시에 벌리지 않는다. 먼저 하나의 사용 가능한 수직 슬라이스를 만든 뒤, 기능 폭을 넓힌다.

## 첫 수직 슬라이스

첫 번째로 관통시킬 흐름은 다음이다.

```text
사용자 대화
  -> Conversation Workbench
  -> Event Store 기록
  -> Provider 1개 + Local 1개 모델 호출
  -> Coding Packet 생성
  -> 실행 기록 보기
  -> Obsidian Markdown 백업
```

이 흐름이 작동하면 앱은 아직 작아도 매일 쓸 수 있다.

## v0 완료 기준

v0는 전체 기능 축소판이 아니라 제품 척추 검증판이다.

- Conversation Mode에서 AI와 대화할 수 있다.
- 모든 메시지와 응답이 Event Store에 저장된다.
- API 키는 secret reference로만 저장된다.
- OpenAI 호환 프로바이더 1개와 Ollama 또는 LM Studio 1개가 동작한다.
- 대화 결과를 Coding Packet으로 만들 수 있다.
- 기록 보기와 재실행이 용어와 기능에서 분리된다.
- Obsidian으로 Markdown 백업이 된다.
- 기본 permission/redaction 정책이 적용된다.

## 뒤로 미룰 것

다음 기능은 설계는 유지하되 v0 필수 경로에서는 제외한다.

- 다중 모델 토론 라운드 고도화
- Agent Soul Full/Retrieved 주입
- 복잡한 Memory Inspector
- Notion 양방향 동기화
- 모바일 전체 조작
- DGX 원격 워크스페이스 실행
- CRDT 또는 복잡한 conflict merge

## 구현 순서 기준

모든 기능은 다음 질문을 통과해야 앞당긴다.

1. 첫 수직 슬라이스를 더 빨리 쓸 수 있게 하는가?
2. Event Store, Redaction, Permission의 기본 원칙을 깨지 않는가?
3. Conversation -> Coding Handoff 흐름을 더 선명하게 하는가?
4. 로컬 폴백 철학과 충돌하지 않는가?
5. 나중에 붙여도 데이터 구조가 크게 깨지지 않는가?

## 결론

이 프로젝트는 작은 장난감을 만들자는 것이 아니다. 하지만 거대한 설계를 한 번에 올리는 것도 아니다. 먼저 실제로 쓸 수 있는 척추를 세우고, 그 위에 Debate, Soul, Memory, DGX, Mobile을 붙인다.
