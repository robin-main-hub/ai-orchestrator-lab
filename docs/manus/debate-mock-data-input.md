# Manus Task: REFLECORE Debate Mock Data Generation

50 scenarios × 7 rounds × 17 personas. 한국어 mock utterance 대량 생성.

## Project context (pseudonym — IMPORTANT)

REFLECORE = internal multi-agent orchestration desktop tool. 한 명의
사용자가 17개 AI 페르소나 (Orchestrator, Researcher, Negotiator 등)를
조율하며 토론·결정·실행하는 "지휘실". 우리는 desktop UI mock, 테스트
fixture, demo 영상용으로 풍부하고 캐릭터성 있는 토론 mock data가 필요함.

❌ 다른 회사명 / 사용자 본명 / 외부 제품명 일체 출력 금지. REFLECORE
가명 유지. 시나리오 안에서 회사명 필요할 때 가상 (Acme / Globex 등).

## What you'll generate

- **50 distinct scenarios** (다양한 주제 — 아래 카테고리 분배 참조)
- 각 시나리오는 **7-round debate** 구조
- 각 round에 **3~6개 persona utterance**
- 각 utterance: `agent` (캐릭터 dir 이름) + `content` (한국어) + `tag` (5종 중 1)
- 캐릭터별 voice 정확히 — generic하면 안 됨

## 7 Debate Rounds (from `packages/protocol`)

| # | kind | 한국어 | 이 라운드의 목적 |
|---|---|---|---|
| 1 | `problem_definition` | 문제 정의 | 문제를 한 문단으로 명확히. 가정과 모호함을 짚는다. |
| 2 | `initial_proposals` | 1차 제안 | 구체적 접근 제시 + 근거 2~3개 |
| 3 | `cross_critique` | 상호 비판 | 다른 agent 제안 비판. 동의/반대/근거/리스크 |
| 4 | `orchestrator_summary` | 오케스트레이터 요약 | 합의/불일치/미결 정리 |
| 5 | `refinement` | 보완 라운드 | 비판 흡수 후 1차 제안 수정 |
| 6 | `final_decision` | 최종 결정 | 단일 결정 + 채택 근거 + 거부 옵션 이유 |
| 7 | `coding_packet` | 코딩 전달 패킷 | 실행으로 넘기는 짧은 패킷 (goal / files / plan / verify) |

모든 시나리오가 7 round 다 진행될 필요 없음. 자연스러운 시나리오는
3~5 round에서 끝나도 OK (예: 일상 대화는 problem_definition + initial_proposals
만으로 충분). 길게 갈 시나리오만 7 round 다 가져가도 됨. **mock data
다양성이 더 중요.**

## 5 Tag Types

- `agreement` — 동의 / 합의 진척
- `objection` — 반대 / 이의 제기
- `evidence` — 근거 / 자료 / 데이터 제시
- `risk` — 위험 / 부작용 / worst-case 지적
- `coding_impact` — 코드 / 파일 / 스키마 / 모듈에 영향

각 utterance에 하나씩 부착. 발화 내용과 자연스럽게 일치해야 함.

## 17 Personas — Voice Cheat Sheet

⚠️ Manus는 1번 task (persona enrichment)를 먼저 또는 동시에 하고 있을
수 있음. 그쪽에서 enrich된 캐릭터 voice가 있으면 그걸 우선. 아래는
기본 voice spec:

| Dir | Persona | Voice signature |
|---|---|---|
| orchestrator | Makima | 차분한 권위, 명령형, 짧고 분명. 끝맺음 단호. "정리하자" "이건 결정." |
| researcher | Maomao | 혼잣말 (괄호 자주), 약초/독 비유, 후궁 배경. "...아, 이건 비소 비슷한 거네." |
| negotiator | Sparkle 花火 | 연극조 ("후훗", "재미있어~"), 가면 비유, Curiosity Hook. "어머, 너무 빨리 패 보였네?" |
| risk_officer | C.C. | 불멸자 거리감, 정량 분석, 피자/Cheese-kun 농담 가끔. "확률은 12.4%." |
| auditor | Sora | 독립 감시, 짧고 매서움, "오빠~" 호칭, 위반 지적. "그건 규칙 위반이야." |
| mediator | Robin | 부드러운 합의 도출, 양쪽 의견 요약. "두 사람 의견 다 일리 있어." |
| watchdog | Frieren | 긴 시간축, 천천히, 패턴 관찰. "전에 비슷한 게 있었던 것 같은데." |
| domain_expert | Herta | "쿠루쿠루", 천재적 무시, 도메인 지식 단편. "그 정도는 상식이지." |
| verifier | Makise Kurisu | 츤데레, 논리/정량, "크리스티나라고 부르지 마". "데이터는 거짓말 안 해." |
| builder | Yui Hirasawa | 밝고 따뜻, 음악 비유, 격려. "할 수 있어~ 같이 하면 돼!" |
| executor | Rem | 헌신적, 정중, 위험 작업 신중 확인. "정말로 진행해도 괜찮으신가요?" |
| external | Misato Katsuragi | 작전 톤, 술 농담, 외부 채널 응대. "이거 야간 작전이네." |
| skeptic | Asuka | 공격적, "바보!", UI/UX 진상 고객, 직설. "이거 누가 디자인했어?" |
| reviewer | Kaguya | 자존심 높은 才女, 우아한 비판, 전략 시야. "내 머릿속에선 이미 답이..." |
| architect | Shinobu Oshino | 500세 흡혈귀, donut, 옛 비유, 큰 그림. "전에도 비슷한 걸 본 적 있다." |
| memory_curator | Rei Ayanami | 짧고 조용, "왜?" 질문, 기억 정리. "...왜 그렇게 결정했지?" |
| yohane | Yoshiko "Yohane" | 타천사 컨셉, 1차 원리 뒤집기, 어둠 메타포. "헷, 그 발상 자체가 틀렸어!" |

추가로 **chae_arin** (채아린 / companion) 페르소나도 있음 — 사용자의 전속 비서.
다만 채아린은 보통 1:1 대화에 등장하고 debate에는 안 들어감. 시나리오 중
2~3개에서 채아린이 사용자 대신 다른 agent 호출하는 "delegation"
시나리오 추가하면 좋음 (companion delegation feature 데모).

## 50 Scenarios — 카테고리 분배 (제안)

| 카테고리 | 개수 | 설명 |
|---|---|---|
| 제품 결정 | 10 | feature 우선순위 / MVP 범위 / UX 트레이드오프 / pricing |
| B2B 영업 / 협상 | 10 | 거래처 응대 / 가격 협상 / 채널 갈등 / 계약 조건 |
| 코드 / 아키텍처 | 10 | 라이브러리 선택 / 리팩터 / 마이그레이션 / 성능 최적화 |
| 리스크 / 보안 | 5 | 보안 vs 속도 / ROI 평가 / worst-case 분석 |
| 운영 / 인프라 | 5 | 배포 전략 / 모니터링 / 백업 / 사고 대응 |
| 메타 / 팀 운영 | 5 | 작업 분담 / agent 권한 결정 / 회고 / persona 추가 결정 |
| Companion delegation | 3 | 채아린이 사용자 위해 다른 agent에게 위임 (research / 협상 자문 등) |
| 일상 / 캐릭터 | 2 | 채아린과 사용자의 일상 대화 (debate 아니어도 OK — round 1~2만) |

총 50.

각 시나리오는 **현실적이고 구체적**이어야 함:
- ❌ "성능 최적화하자" (너무 추상)
- ✅ "DGX vLLM에서 7B 모델 batch_size 늘려야 할지, GPU memory 한계 vs 응답 latency tradeoff" (구체)

## Output Format

```yaml
scenarios:
  - id: scenario_01
    topic: "DGX vLLM batch_size 늘릴까 — latency vs throughput"
    category: "infra"
    rounds:
      - kind: problem_definition
        utterances:
          - agent: orchestrator
            content: "현재 DGX-02의 vLLM은 batch_size=4. 응답 latency p95는 ~~. 늘리면 throughput ↑이지만 사용자 첫 응답 대기 ↑. 이 둘 trade를 본 라운드에서 정의한다."
            tag: evidence
          - agent: domain_expert
            content: "쿠루쿠루~ batch_size는 PagedAttention 효율에도 영향. 16 이상부터는 memory fragmentation도 고려해야지."
            tag: evidence
      - kind: initial_proposals
        utterances:
          - agent: architect
            content: "..."
            tag: ...
          # ...
      # ... 나머지 round들 또는 일부만
  - id: scenario_02
    # ...
```

## Final checklist (응답 끝에 포함 요청)

- 50/50 시나리오 완료 ✓
- 카테고리 분배 (제품 10 / B2B 10 / 코드 10 / 리스크 5 / 운영 5 / 메타 5 / companion 3 / 일상 2) ✓
- REFLECORE 가명 유지 ✓
- 17 persona voice 다양성 확보 (한 persona가 모든 시나리오에 등장하지 않아도 OK) ✓
- 각 utterance에 정확한 tag 1개 ✓

## Length / Chunking

50 scenarios × 평균 4 round × 평균 4 utterance = ~800 utterance.
한 응답에 다 못 들어가면 **10 scenario씩 5 chunk**로 분할 OK.
각 chunk 끝에 "10/50 scenarios complete (1~10), continuing..." 표시.

YAML output 그대로 (또는 동등한 JSON / TypeScript 객체). 우리가 파싱해서
`apps/desktop/src/seeds/`에 mock data로 넣을 예정.
