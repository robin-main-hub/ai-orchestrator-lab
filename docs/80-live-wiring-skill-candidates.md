# 80 — Live Wiring L6: Skill Archive candidate 자동 생성 + Curator route

Skill archive/curator 스키마(PR6)는 있었지만 머지가 끝나도 candidate가 자동으로 생기지
않았다. L6은 **real merge → suggested candidate → curator 승인 → export** 루프를 연결한다.

```
mission.merge(merged) → deriveSkillCandidatesFromMission
                      → memory.skill_candidate.created (suggested)
GET  /missions/:id/skills                  → curator queue
POST /missions/:id/skills/:cid/curate      → memory.skill_candidate.curated → (approved면) export
```

## 한 일

- **protocol**: `memory.skill_candidate.created` / `.curated` payload + `deriveSkillArchiveQueue`
  (created+curated 이벤트 → 현재 큐, 순수). skill candidate는 **mission이 아니라 memory
  도메인 이벤트**라 missionIndex(mission.* 필터)를 오염시키지 않고 같은 EventStorage에 산다.
- **store**: `merge`가 **status==="merged"일 때만** `deriveSkillCandidatesFromMission`으로
  suggested 후보를 만들어 append. `skills(missionId)`(큐 읽기) + `curateSkill(id, decision)`
  (approve/reject/pin → trustStatus 전이 + 승인 시 export) 추가.
- **routes**: `GET /missions/:id/skills`, `POST /missions/:id/skills/:cid/curate`.
- **server**: `exportApprovedSkill`를 `buildObsidianSkillNote`(idempotent path `skills/<id>.md`)
  로 `ORCHESTRATOR_SKILL_EXPORT_DIR`에 write. 미설정이면 export 생략(큐는 그대로 approved).

## 정직성 불변식 (테스트로 못박음)

- **merged 미션만** candidate 생성 — 실패/미머지 미션은 0(테스트로 확인).
- **자동 trusted 승격 없음** — created는 항상 suggested, curator 승인(approve/pin)으로만
  curator_approved/pinned.
- **승인된 것만 export** — reject는 export 안 함(테스트로 exported 0 확인).
- candidate id는 서버 생성(`skill_<missionId>_<kind>`) → export path traversal 안전,
  re-derive 시 dedup(이벤트 id 멱등).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| merged mission → suggested candidate | ✅ |
| failed mission → trusted 생성 안 됨 | ✅ 0 candidate |
| repeated same candidate → idempotent | ✅ 이벤트 id dedup |
| curator approve → curator_approved | ✅ + 큐 반영 |
| Obsidian export → 승인된 것만 | ✅ reject는 export 0 |

## 검증

protocol 71(+3) · server 224(+8) 그린, typecheck 그린. docs/80.
