# 41 — 로어북 / 월드인포 (옵션 · 멀티테넌트)

디퍼드 #4 마무리. SillyTavern world-info 개념의 키워드 트리거 컨텍스트 주입 —
두 가지 하드 요구사항을 1급으로 충족한다:

- **옵션** — 어디서도 기본 OFF. 콘솔 토글을 켜고, book/entry 자체의 `enabled`가
  켜져 있고, 미션 텍스트에 키워드가 실제로 등장할 때만 주입된다.
- **멀티테넌트** — 모든 북은 `tenantId` 소유. 스캔은 요청 테넌트의 북 +
  명시적 `shared` 테넌트 북만 본다. 한 배포에 여러 회사의 월드인포를 누수 없이
  수용 (다른 회사에서 재사용 가능).

## 엔진 (`packages/agents/src/lorebook.ts`)

- `scanLorebooks(books, scanText, {tenantId, maxEntries=8, tokenBudget=800})`
  — 키워드 매칭(기본 대소문자 무시, `caseSensitive` 지원), `constant`(상시 고정)
  항목, `insertionOrder` 정렬, 항목 수·토큰 예산 캡(초과 항목은 건너뛰고 작은
  항목은 계속 시도).
- `buildLorebookFragment(matches)` — `## World Info (lorebook)` 블록 렌더.
- `characterBookToLorebook(card.data.character_book, {id, tenantId})` —
  SillyTavern 캐릭터 카드 V2 내장 북 임포트 (캐릭터 카드 컨버터와 연동).
- `isLorebook` — 디스크/번들 JSON 구조 검증 (깨진 북은 조용히 제외).

## 데스크톱 연동

- `lorebooks/*.json` 이 Vite 번들로 로드된다 (`lib/lorebookSource.ts`).
  샘플: `orchestrator-core`(default 테넌트), `example-tenant-acme`(멀티테넌트
  격리 데모).
- 병렬 콘솔: "로어북 주입 (옵션)" 토글(기본 OFF) + 테넌트 입력. 켜면 미션별
  goal/검증단계/킥오프 텍스트를 스캔해 매칭된 로어만 정체성 주입 뒤에 덧붙인다.
- 주입 지점: `buildPersonaInjectionPlan({ worldInfo })` — identity 다음, 게이트
  통과 동일. 단일 실행 API(`runAutonomousPersonaTask.worldInfo`)에도 노출.

## 새 북 추가

`lorebooks/<id>.json` 파일 하나 추가:
```json
{
  "id": "my-company", "name": "My Co Lore", "tenantId": "myco",
  "enabled": true,
  "entries": [{ "id": "rule1", "keys": ["배포"], "content": "[로어] ...",
                "enabled": true, "insertionOrder": 0 }]
}
```
