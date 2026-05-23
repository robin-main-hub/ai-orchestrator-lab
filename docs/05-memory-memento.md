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
- 중요도 조정
- pin/unpin
- 삭제
- 병합
- 잘못된 기억 신고

## DGX와 로컬의 관계

DGX가 연결되어 있으면 중앙 Memento 서버를 사용한다. DGX가 끊기면 데스크톱은 마지막으로 동기화된 로컬 캐시를 읽기 전용으로 사용하고, 새 기억은 로컬 pending queue에 쌓는다. 서버가 복구되면 충돌 검사를 거쳐 동기화한다.
