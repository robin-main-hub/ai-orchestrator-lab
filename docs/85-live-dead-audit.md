# 85 — Live/Dead Audit (Coding/Design OS D1)

새 방향(Coding+Design OS)의 출발점을 정직하게 못박는다. 22개 read-only 에이전트가 엔진별로
**서버 배선 + 데스크톱 소비**를 file:line 증거로 감사하고, 각 "live" 주장을 적대 검증했다.

## 결론: 엔진은 전부 서버에서 LIVE. 갭은 전적으로 **데스크톱 UI 소비**다.

| 엔진 | 서버 | 데스크톱 UI | 비고 |
| --- | --- | --- | --- |
| L1 trace broadcast | **LIVE** | DEAD | SSE `/trace/stream` 소비자 없음 — 8초 폴링만 |
| L2 runner registry | **LIVE** | LIVE | verify 버튼 → 서버 검증 |
| L3 checkpoint hooks | **LIVE** | partial | auto는 서버, 수동 checkpoint/rollback UI 없음 |
| L4 error card | **LIVE** | partial | record로 흐르나 전용 UI 없음 |
| L5 self-correction | **LIVE** | partial | record에 있으나 UI 없음 |
| L6 skill candidates | **LIVE** | DEAD | `/skills`·curate 소비자 없음 |
| L7 template mission | **LIVE** | DEAD | 회사 템플릿 — **새 방향상 보류 대상** |
| mission lifecycle | **LIVE** | **LIVE** | create/verify/merge 풀 소비 |
| agent debate | **LIVE** | **LIVE** | 단, debate→mission은 CodingPacket 단계를 거침(D6 갭) |
| sandbox runner | **LIVE** | (의도적 미게이트) | 서버 verify; 데스크톱 autonomy는 설계상 un-gated |

**데스크톱 product gap**: 미션 엔드포인트 13개 중 데스크톱이 소비하는 건 5개
(fetch/create/verify/merge/appendEvent). DEAD-at-UI: kanban · trace · trace/stream ·
checkpoints · rollback · skills · curate · from-template (+ 이번에 추가한 workspace ·
from-blueprint).

## 의미

- L8 스모크가 15/15로 증명했듯 **서버 풀루프는 진짜 살아있다**(적대 검증도 모든 서버
  call path를 confirm). dead engine은 없다.
- 사용자가 "그래서 내 작업 어디까지 갔지?"를 못 보는 이유는 **엔진이 죽어서가 아니라
  데스크톱이 아직 그 엔진을 화면에 안 띄워서**다. → 새 방향의 D2~D9(엔진 primitive)과
  **병행해서** "live 엔진을 데스크톱에 surface"하는 트랙이 필요(사용자 UI 별도 트랙과 정합).

## 검증 품질 메모

- 적대 검증 22 에이전트가 서버 call path를 전부 confirm(no dead path). L7 verifier 1개가
  cwd 혼동으로 "파일 없음" 오판(false negative) — 감사 본문 증거는 견고(서버 live, 데스크톱
  dead). L6 verifier의 confirmedLive:false는 "데스크톱에서 도달 불가"를 지적한 것으로,
  desktopStatus=DEAD 결론과 정합(모순 아님).

## 다음

D2 AppWorkspace(완료) · D3 DesignBlueprint(완료) · D4 Preview runner · D5 Visual QA/
DesignIssueCard · D6 Debate→Blueprint→Mission(위 debate 갭 해소) · D7 generic 템플릿 · D8
control strip · D9 app-build smoke. + 병행 "desktop surfacing"(별도 UI 트랙).
