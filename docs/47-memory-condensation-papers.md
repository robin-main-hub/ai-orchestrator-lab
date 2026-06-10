# 47 — 기억/대화 응축 논문 적용·제안 (MT-OSC + MTRAG-UN)

두 논문을 정독(멀티에이전트)하고 우리 기억 아키텍처와 대조해, 논문1은 **적용**,
논문2는 **제안**으로 정리한다.

## 논문 1 — MT-OSC (arXiv 2604.08782) — **적용함**
"One-off Sequential Condensation": 멀티턴 대화 기록을 백그라운드에서 응축. 두 부품:
- **Decider**(규칙 게이트, LLM 불필요): 어시스턴트 발언 중복도 > γ(0.2) AND 사용자
  토큰 > τ(1000)이면 응축 **보류**(정보 밀집 리파인먼트 아크 보호). 측정상 이
  게이트가 ToTTo/Refinement 성능 붕괴를 막는 핵심.
- **Condenser**: 사용자 측 near-verbatim, 어시스턴트 측 핵심만. 보존 정보 클래스 =
  숫자/지시/정정·부정/엔티티/의도vs가정. 순차 재응축 C2=Condense(C1∪새턴)로 성장 bound.
- 결과: 10턴 대화 토큰 -72%, ≥6턴 평균 -45.5%, 정확도는 통계적으로 동일(p=0.19).

### 우리 시스템에 적용한 것 (이 PR)
- **`lib/conversationCondenser.ts`** (순수, 12 테스트): MT-OSC 코어를 LLM 없이 구현.
  한국어 조사 lemmatization-lite(이/가/을/를/은/는/에서/에게…)로 중복도 계산,
  `shouldWithholdCondensation` Decider, 핵심 정보 추출기(파일경로/에러/결정/정정/숫자),
  추출형 `condense`(사용자 verbatim·어시스턴트 핵심), 순차 재응축 + 예산 bound.
- **코딩 워크벤치 /compact 교체**: 기계적 160자 잘림 → 추출형 응축. **실패한 도구
  출력의 머리·꼬리를 보존**(전엔 통째로 버려짐 — 다음 턴에 필요한 에러 꼬리가 바로
  그것). 요약을 prior 쌍으로 접어 재응축하므로 단조 증가 안 함.
- **usage 기반 자동 응축**: `session.usage.inputTokens`가 갱신만 되고 안 읽히던 걸,
  임계(12k) 초과 + Decider 허용 시 백그라운드 자동 /compact. 수동 /compact는 force.

### 후속 적용 후보 (이번엔 보류)
- **대화 파이프라인 8-메시지 절벽 교체**: `conversationPipeline.ts`의 `slice(-8)` +
  `stage12DgxProvider`의 이중 카운트 트렁케이션(8 vs 7 off-by-design)을 토큰 예산
  단일 어셈블러로. 페르소나 시스템 프롬프트가 커서 history 예산을
  `modelContext - systemPromptTokens - max_tokens`로 계산해야 함. + 응축본을
  per-agent MemoryRecord(layer:episode)로 미러해 재시작 후에도 연속성 유지.
- LLM 백엔드 교체 경로: `CondenserBackend` 인터페이스 — 추출형이 기본·폴백,
  논문의 few-shot 프롬프트(temp 0.01, freq_penalty 1, JSON)를 로컬 vLLM로 업그레이드.

## 논문 2 — MTRAG-UN (arXiv 2602.23184) — **제안만**
멀티턴 RAG의 4가지 난제 카테고리 벤치마크(666 태스크·2800+ 턴): 답변불가/불충분명세/
비독립질문/불명확응답. 모델이 공통적으로 "그럴듯한 가정으로 답해버림"이 핵심 실패.

우리 recall은 순수 lexical(`memoryViews` semanticView가 `[]` 스텁) + recall 쿼리에
scope 토큰(agent:/session:/provider:)이 섞여 점수 오염 + 0.18 임계를 pin/trust 부스트로
무관 기억이 넘는 구조. 제안(가치순):
1. **비독립 질문 쿼리 재작성** (+scope 토큰 정화): 한국어 대명사 follow-up("걔가 그거
   언제 한댔지?")이 지금은 아무것도 못 찾음. 재작성으로 recall·lorebook 트리거 동시 개선.
2. **답변가능성 가드 + 명시적 IDK 주입**: content-only 점수로 재계산, 임계 미달이면
   recall 블록 억제하고 "관련 기억 없음 — 지어내지 말 것" 지시. 페르소나는 환각이
   유창해서 최우선 무결성 보호. + remember가 no-memory 턴은 재섭취 안 하게.
3. **불충분명세 감지 → 후보 나열 헤지**: 멀티테넌트 lorebook에서 비슷한 이름 2개 등
   기계적으로 탐지 가능. 잘못된 캐릭터로 답하는 건 몰입 깨짐 최상위.
4. **챌린지 턴 분류 → 강제 재검색 + dispute 원장**: 사용자 반박(아니/틀렸)을 기존
   reflection worker 신호로. disputedCount≥2 격리.
5. **사내 UN/UN/NON/UN 평가 하니스**: 1~4의 회귀망. 규칙 judge면 CI에서 LLM 없이 가능.

전제: durable remember(현재 promotion_pending throw로 휘발) + semanticView 임베딩 구현이
2·1의 토대.
