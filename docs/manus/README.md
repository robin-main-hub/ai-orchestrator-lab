# Manus AI — work archive

이 폴더는 [Manus AI](https://manus.im) 에게 던진 task의 **input prompt**와
받은 **output 결과**를 함께 보존합니다. 일회성 작업이지만 reference로
유지하는 게 가치 큼 (decision rationale, 향후 비슷한 task template, audit).

## 파일 분류

| 파일 | 종류 | 상태 | 비고 |
|---|---|---|---|
| `persona-enrichment-input.md` | 입력 prompt | ✅ 발송 + 결과 통합 완료 | 17 캐릭터 SOUL/AGENTS 풍부화 요청. ~147KB 한국어 instruction + 33 현재 파일 paste |
| `persona-enrichment-output.md` | 결과 (니뭉 작성, 1차) | ✅ 받음 | 15 캐릭터 분량. verifier/domain_expert 누락 |
| `persona-enrichment-supplement.md` | 결과 (니뭉 작성, 2차 보충) | ✅ 받음 | 누락된 verifier (Makise) + domain_expert (Herta) 2개 |
| `debate-mock-data-input.md` | 입력 prompt | ✅ 발송 + 결과 통합 완료 | 50 시나리오 × 7 round × 17 persona mock utterance 생성 요청. YAML output |
| `debate-mock-data-output.yaml` | 결과 (니뭉 작성) | ✅ 받음 + ship | apps/desktop/src/seeds/debateMockData.json 으로 변환 ship (PR #116) |
| `competitive-ux-research-output.md` | 결과 (니뭉 작성) | ✅ 받음 + 채택 결정 정리 | Linear / Arc / Cursor / Warp / Notion AI / Raycast / Cline UX 분석. docs/design-decisions.md에 채택/거부 분류 |
| `competitive_tool_ux_research.csv` | 결과 보조 데이터 | ✅ 받음 | 위 분석의 raw 데이터 (도구별 비교) |

## 결정 추적

받은 결과를 어떻게 채택/보류/거부했는지는 단일 source: [`../design-decisions.md`](../design-decisions.md). 새 Manus 결과를 받으면 그쪽에 추가.

## 보안 규칙

이 폴더의 모든 input은 외부 AI (Manus / Claude / Codex)에 송신되는
prompt임. 따라서:

- ❌ 회사명 (Example Domain) 노출 금지 → **REFLECORE** 가명 일관 사용
- ❌ API 키 / OAuth 토큰 / 사용자 본명 / 내부 SSO ID 일체 금지
- ❌ DGX-01 시스템 정보 / vLLM 내부 endpoint 노출 금지
- ✅ 19금 / 성적 표현 sanitize (특히 character persona enrichment)
- ✅ 모든 input file 발송 전 검토 (사용자 또는 Claude review)
