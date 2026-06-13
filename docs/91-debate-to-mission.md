# 91 — Debate → Blueprint → Mission (Coding/Design OS D6)

감사(docs/85)가 짚은 갭: agent_debate는 live지만 토론 결과가 CodingPacket 중간단계를
거쳐야만 미션이 됐다. D6은 **토론 결정 패킷을 바로 DesignBlueprint → Mission으로 승격**한다.
제품의 차별점(캐릭터 토론)이 말로 끝나지 않고 실행으로 연결된다.

```
대화/토론 → DebateDecisionPacket → debateDecisionToBlueprintInput → DesignBlueprint
         → buildMissionCreateFromBlueprint(debateId provenance) → Mission + workspace
POST /missions/from-debate
```

## 한 일

- **protocol** `debateBridge.ts`: `DebateDecisionPacket`(kind/summary/adoptedDecisions/
  rejectedOptions/openQuestions), `shouldDebateBeforeMission`(큰 변경만 토론, 단순 수정은
  바로 미션), `debateDecisionToBlueprintInput`(순수 — 패킷 → 블루프린트 입력, **결정 없으면
  null**). `buildMissionCreateFromBlueprint`에 `debateId`(provenance) 추가.
- **server**: `POST /missions/from-debate` — 패킷을 블루프린트로 변환(없으면 400) → D3 경로
  재사용(store.create + attachDesignBlueprint)으로 디자인 미션 생성. mission.debateId로 출처
  토론 연결.
- **desktop**: `createDgxMissionFromDebate` 래퍼.

## 불변식 (테스트로 못박음)

- **토론이 실행 가능한 결정(adoptedDecisions)을 못 내면 승격 실패**(400) — 말잔치 금지.
- 단순 수정은 토론 강제 안 함(shouldDebateBeforeMission=false → 바로 미션).
- 변환은 순수 함수. 실제 토론 엔진(desktop runStage3DebateSession)은 그대로, 그 출력만
  다리로 받는다(중복 구현 없음).
- 승격된 미션은 truthStatus planned + debateId provenance + 디자인 팀 배정(D3).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| debate result → Blueprint → Mission | ✅ from-debate |
| 실행 가능 Mission 연결 안 되면 실패 | ✅ 결정 없으면 400/null |
| 단순 수정은 debate 강제 안 함 | ✅ shouldDebateBeforeMission |
| provenance | ✅ mission.debateId |

## 후속

desktop 토론 UI(Stage3DebateTable)에서 "이 결론을 미션으로" 버튼 → createDgxMissionFromDebate
배선은 UI 트랙(클라이언트 seam은 준비됨).

## 검증

protocol 96(+4) · server 259(+2) · desktop typecheck 그린. docs/91.
