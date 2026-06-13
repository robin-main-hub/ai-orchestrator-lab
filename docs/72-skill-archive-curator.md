# 72 — Skill Archive / Curator loop (Orchestration OS PR6)

Hermes 실전 팁: 작업이 끝날 때마다 잘 먹힌 패턴을 skill candidate로 남기고 curator가
승격한다. 순수 로직(protocol, 테스트).

## 흐름

```text
mission merged → skill candidate(suggested) → curator approve/reject → pinned
              → Obsidian export
```

`skillArchive.ts`:
- `deriveSkillCandidatesFromMission(record)` — **merged 미션만** candidate 생성, 전부
  `suggested`(자동 trust 금지). merge_pattern(브랜치→sha) + (실패했다 통과한 검증이
  있으면) verification_fix(수정 지시 재사용).
- `applyCuratorDecision(candidate, approve|reject|pin)` — trustStatus 전이. 승인/핀만
  trusted, 거절은 rejected.
- `isExportableSkill` — curator_approved/pinned만 export 가능(suggested 제외).
- `buildObsidianSkillNote` — id로 결정되는 경로/내용이라 **idempotent**.

## 불변식 (GPT PRO 원칙)

- merged 미션만 candidate, 실패/미머지 미션은 trusted skill 자동 생성 안 함(빈 배열).
- 자동으로 trusted/pinned로 안 들어감 — 반드시 curator 승인.
- Obsidian은 source of truth가 아니라 export view, export는 idempotent.

## 후속

라이브 배선(merged 이벤트에서 candidate emit + curator 큐 UI + 실제 Obsidian 파일 쓰기)은
후속. 이번 PR은 candidate 도출·승격·export 빌더 엔진을 테스트와 함께 완성.

## 검증

protocol +5(59 그린), 빌드·desktop typecheck. docs/72.

## 다음

PR7 GIOLITE workflow templates + 핵심 페르소나 조직.
