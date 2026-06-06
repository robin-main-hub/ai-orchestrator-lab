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

모든 memory record에는 출처와 신뢰도를 붙인다. External Ingress, 외부 API, 리셀러 provider에서 나온 내용은 기본적으로 `untrusted` 또는 `limited`로 저장한다.

```ts
export type MemoryRecord = {
  id: string;
  content: string;
  sourceChannel: "desktop" | "external_legacy" | "mobile" | "api" | "server" | "system";
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

이 정책은 External Ingress context poisoning과 리셀러 프록시로 인한 장기 메모리 유출을 줄이기 위한 기본 방어선이다.

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

## DGX, MacBook, SimpleMem의 관계

DGX-02는 원본 저장소이며 Event Store, MemoryRecord, WorkItem, approval, draft의 authority다.

MacBook은 주 작업 클라이언트다. 온라인일 때는 DGX-02 authority에 기록하고, 오프라인일 때는 로컬 cache/outbox에 임시 저장한 뒤 온라인 복귀 시 DGX-02로 동기화한다.

SimpleMem은 DGX-02에 두는 고성능 검색 인덱스다. 하지만 SimpleMem이 원본 기억 DB가 되면 안 된다. 원본 기억은 DGX-02 Event Store와 MemoryRecord이고, SimpleMem은 그 원본에서 파생된 semantic/lexical/symbolic retrieval index다.

폰이나 remote input에서 생긴 기억 후보는 처음에는 pending client input 또는 archival write request로 남긴다. DGX-02 authority가 수신한 뒤 Memory Curator/Orchestrator가 promotion, rejection을 결정한다.

장기 기억 쓰기는 에이전트가 직접 `insert`하지 않는다. 에이전트는 `memory.archival_write.requested`를 만들고, 승격된 MemoryRecord만 DGX-02 SimpleMem에 색인한다.

세부 설계는 `docs/28-simplemem-continuity-memory.md`를 따른다.
