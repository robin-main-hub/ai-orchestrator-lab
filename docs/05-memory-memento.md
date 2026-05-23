# Memento 스타일 메모리

## 목표

메모리는 단순 대화 로그 저장소가 아니다. 작업 중 반복해서 등장하는 선호, 결정, 실패, 프로젝트 규칙을 장기 기억으로 남기고, 필요한 순간에 근거와 함께 다시 불러와야 한다.

## 메모리 계층

| 계층 | 설명 |
| --- | --- |
| Fragment | 짧은 사실, 선호, 규칙 |
| Episode | 한 작업 세션의 흐름과 결과 |
| Reflection | 여러 에피소드에서 뽑은 교훈 |
| Project Memory | 특정 저장소/워크스페이스에 묶인 기억 |
| User Memory | 사용자의 장기 선호와 작업 방식 |

## 기본 API

```ts
export type MemoryAPI = {
  recall(query: RecallQuery): Promise<RecallResult[]>;
  remember(input: MemoryInput): Promise<MemoryRecord>;
  reflect(sessionId: string): Promise<Reflection>;
  pin(recordId: string): Promise<void>;
  forget(recordId: string): Promise<void>;
};
```

## 메모리 신뢰도

모든 memory record에는 출처와 신뢰도를 붙인다. Telegram, 외부 API, 리셀러 provider에서 나온 내용은 기본적으로 `untrusted` 또는 `limited`로 저장한다.

```ts
export type MemoryRecord = {
  id: string;
  content: string;
  sourceChannel: "desktop" | "telegram" | "mobile" | "api" | "server" | "system";
  trustLevel: "trusted" | "limited" | "untrusted";
  projectId?: string;
  createdAt: string;
  revisionId: string;
};
```

Recall 기본 정책:

- `trusted`: 일반 recall 대상
- `limited`: 사용자가 허용한 프로젝트/세션에서만 recall
- `untrusted`: 자동 recall 금지. Memory Curator 또는 사용자 승인 후 승격 가능

이 정책은 Telegram context poisoning과 리셀러 프록시로 인한 장기 메모리 유출을 줄이기 위한 기본 방어선이다.

## Recall Trace

오케스트레이터는 어떤 기억을 사용했는지 숨기지 않는다.

- 호출된 query
- 반환된 기억
- 점수
- 사용 여부
- 최종 결정에 미친 영향

이 정보는 UI에서 `Recall Trace`로 보여준다.

## Memory Inspector

사용자는 기억을 직접 관리할 수 있어야 한다.

- 검색
- 프로젝트별 필터
- source channel/trust level 필터
- 중요도 조정
- trust level 승격/강등
- pin/unpin
- 삭제
- 병합
- 잘못된 기억 신고

## Stage6 구현 경계

현재 구현은 실제 Memento-MCP 서버나 벡터 DB를 붙이지 않고, 데스크톱 런타임에서 다음 경계를 먼저 고정한다.

- `MemoryTrace`는 query, recall results, provider trust policy, 사용/차단 여부를 하나로 묶는다.
- `MemoryRecallPolicy`는 리셀러/custom 같은 `untrusted` provider에서 `Project Memory`, `User Memory` 자동 recall을 차단한다.
- Memento Inspector는 record 수, pinned 수, blocked recall 수, Recall Trace, Memory Records를 오른쪽 패널에 표시한다.
- `Memory` 버튼은 현재 대화와 Coding Packet에서 episode/reflection 후보를 만들고 Event Store에 `memory.candidate.created` 이벤트를 남긴다.
- `pin`은 기억을 수동 고정하고, `forget`은 물리 삭제가 아니라 tombstone projection으로 처리한다.

## Forget 정책

Event Store가 append-only이면 `forget`은 단순 삭제가 아니다.

- 메모리 record는 tombstone 처리한다.
- projection에서는 해당 내용을 제거하거나 `[FORGOTTEN]`으로 대체한다.
- 관련 Obsidian/Notion export는 다음 동기화에서 소급 수정한다.
- secret은 secret storage에서 실제 삭제한다.

## DGX와 로컬의 관계

DGX가 연결되어 있으면 중앙 Memento 서버를 사용한다. DGX가 끊기면 데스크톱은 마지막으로 동기화된 로컬 캐시를 읽기 전용으로 사용하고, 새 기억은 로컬 pending queue에 쌓는다. 서버가 복구되면 충돌 검사를 거쳐 동기화한다. 초기 충돌 해결은 복잡한 CRDT 대신 revision id와 last-write-wins, conflict event 기록으로 시작한다.
