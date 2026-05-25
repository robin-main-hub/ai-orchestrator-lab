# Manus AI — work archive

이 폴더는 [Manus AI](https://manus.im) 에게 던진 task의 **input prompt**와
받은 **output 결과**를 함께 보존합니다. 일회성 작업이지만 reference로
유지하는 게 가치 큼 (decision rationale, 향후 비슷한 task template, audit).

## 파일 분류

| 파일 | 종류 | 상태 | 비고 |
|---|---|---|---|
| `persona-enrichment-input.md` | 입력 prompt | 발송 완료 (사용자가 Manus에 paste) | 17 캐릭터 SOUL/AGENTS 풍부화 요청. ~147KB 한국어 instruction + 33 현재 파일 paste. ~1500 코인 예상 |
| `debate-mock-data-input.md` | 입력 prompt | 발송 대기 | 50 시나리오 × 7 round × 17 persona mock utterance 생성 요청. YAML output. ~1000 코인 예상 |
| `competitive-ux-research-output.md` | 결과 (Manus 작성) | ✅ 받음 | Linear / Arc / Cursor / Warp / Notion AI / Raycast / Cline UX 분석 |
| `competitive_tool_ux_research.csv` | 결과 보조 데이터 | ✅ 받음 | 위 분석의 raw 데이터 (도구별 비교) |

## 결정 추적

받은 결과를 어떻게 채택/보류/거부했는지는 단일 source: [`../design-decisions.md`](../design-decisions.md). 새 Manus 결과를 받으면 그쪽에 추가.

## 보안 규칙

이 폴더의 모든 input은 외부 AI (Manus / Claude / Codex)에 송신되는
prompt임. 따라서:

- ❌ 회사명 (Giolite) 노출 금지 → **REFLECORE** 가명 일관 사용
- ❌ API 키 / OAuth 토큰 / 사용자 본명 / 내부 SSO ID 일체 금지
- ❌ DGX-01 시스템 정보 / vLLM 내부 endpoint 노출 금지
- ✅ 19금 / 성적 표현 sanitize (특히 character persona enrichment)
- ✅ 모든 input file 발송 전 검토 (사용자 또는 Claude review)
