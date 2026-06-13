# 82 — Live Wiring L8: Product E2E Smoke

기능이 많아졌으니(테스트 1000+개) 이제 **"진짜 사용 루프"가 한 번에 깨지는지** 보는
product smoke가 필요하다. unit test와 별개로, 실제 미션 라이프사이클을 한 번에 증명한다.

```
scripts/smoke-orchestration-os.mjs   (한 명령: pnpm orchestration:smoke)
```

## 한 일

- **hermetic 자기 서버**: temp git repo + temp EventStorage로 자기 서버 인스턴스를 띄운다
  (실제 프로젝트 repo 미접촉). 검증도 `ORCHESTRATOR_VERIFY_CWD`(이번에 추가)로 temp repo
  에서 돌려 실제 repo를 안 건드린다.
- **풀루프 15스텝**: health → mission 생성 → checkpoint(observed sha) → verify 실패
  (error card + self-correction) → auto checkpoint 확인 → verify 성공(observed) →
  merge queue → **merge(real sha 또는 정직한 dry_run)** → skill candidate → kanban →
  trace → **서버 재시작 후 복원**.
- **정직 판정**: merge는 merged면 real sha를, 아니면 sha 없음을 확인(real sha XOR no sha).
  dry_run/conflict/blocked도 그대로 보고 — 가짜 observed 없음.
- **리포트**: temp base에 `smoke-report.json` + `.md`(스텝별 결과 표). 임시 폴더는 끝나면
  정리(SMOKE_KEEP=1로 보존). 종료코드: critical 스텝 실패 시 1.

## 실측 결과 (이번 실행)

15/15 PASS, **merge=merged (real sha 867132a9...)**, trace 11 events, skill candidates 2개
(merge_pattern + verification_fix), 재시작 후 미션 복원 확인. → 엔진이 "생김"이 아니라
**실제 미션 루프에 연결됨**을 라이브로 증명.

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| one command smoke | ✅ `pnpm orchestration:smoke` |
| temp repo 사용(실제 repo 보호) | ✅ temp repo + ORCHESTRATOR_VERIFY_CWD |
| no fake observed | ✅ real sha XOR no sha, dry_run 명시 |
| report markdown/json | ✅ smoke-report.{json,md} |
| CI optional (로컬/DGX 실행) | ✅ 서버 빌드만 있으면 실행 |

## 검증

스모크 15/15 PASS(실측). server 빌드 그린. docs/82.

## Live Wiring 시리즈 완료 (docs/76–82)

L1 trace broadcast · L2 runner registry · L3 checkpoint hooks · L4 error card emit ·
L5 self-correction · L6 skill candidate emit · L7 workflow template mission · L8 product
smoke. **모든 엔진이 실제 mission 루프에 연결됨** — dead engine 0.
