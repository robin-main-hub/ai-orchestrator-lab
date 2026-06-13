# GitHub Write Actions — Safety Design (DESIGN ONLY, 미구현)

> 상태: **설계 문서**. 이 문서는 GitHub **쓰기** 기능을 어떻게 안전하게 붙일지에 대한
> 계약이다. **여기에 적힌 어떤 write도 아직 구현되지 않았고, 구현해서도 안 된다.**
> 현재 GitHub 연동은 D~D3까지 **읽기 전용**이다([99-github-readonly-connector.md](99-github-readonly-connector.md)).
> write는 아래 게이트가 전부 갖춰진 뒤에야, 그것도 기본 **disabled** 상태로 들어간다.

## 0. 왜 문서부터인가

읽기는 잘못돼도 "본 것"에 그치지만, 쓰기는 외부에 부수효과를 남긴다(브랜치·커밋·PR·코멘트).
이 제품의 핵심 원칙 — "화면에 보이는 것 = 실제 데이터", "위험한 것은 자동화하지 않는다" — 을
지키려면 write는 read보다 훨씬 강한 게이트가 필요하다. 그 게이트를 먼저 합의한다.

## 1. 기본 원칙 (불변식)

```text
- write는 기본 DISABLED. 명시적 opt-in(서버 env 플래그 + 운영자 승인) 없이는 노출조차 안 함.
- 모든 write는 승인 게이트를 통과한다(기존 ApprovalQueueItem 경로 재사용).
- 모든 write는 실행 전에 정확한 payload preview(commandPreview/diff)를 보여준다.
- preview는 합성하지 않는다. 실제로 보낼 것과 1:1로 일치해야 한다(B/C의 commandPreview 정직성 규칙).
- repo allowlist에 없는 저장소에는 write 불가.
- 토큰 스코프가 write를 허용하지 않으면 정직하게 "권한 부족"으로 거절(가짜 성공 금지).
- dry-run을 먼저 통과해야 실제 write 가능.
- 되돌릴 수 있어야 한다(checkpoint/rollback 또는 명시적 undo 경로).
- 모든 write는 audit trace로 남는다(redacted: 토큰·헤더 제외).
- observed vs planned 분리: "보낼 예정"은 planned, 서버가 GitHub 200을 받은 것만 observed.
```

## 2. 허용 후보 write actions (단계적)

기존 read-only 도구(`github_pr_read` 등)와 대칭되게, **위험도 순으로 가장 약한 것부터**.

| action | 위험도 | 부수효과 | 비고 |
|---|---|---|---|
| `github_issue_comment` | 낮음 | 이슈에 코멘트 1건 | 되돌리기=코멘트 삭제(별도 승인) |
| `github_pr_comment` | 낮음 | PR에 코멘트 1건 | 동일 |
| `github_branch_create` | 중간 | 새 브랜치 ref | 되돌리기=브랜치 삭제. 네이밍 정책 필수 |
| `github_commit` | 높음 | 브랜치에 커밋 | allowlist 브랜치만, diff preview 필수 |
| `github_pr_create` | 높음 | PR 생성 | base/head allowlist, 본문 preview |

> `git push`(직접 기본 브랜치)·force-push·`pr_merge`·`branch_delete`(대량)·repo 설정 변경은
> **이 설계 범위 밖**. 별도 더 강한 게이트가 필요하며 당분간 금지.

## 3. action별 required approval

```text
issue_comment / pr_comment:
  - 1인 운영자 승인(human) + comment 본문 preview
  - sourceTrust=trusted 세션에서만, untrusted ingress에서 발의 금지

branch_create:
  - 운영자 승인 + branch naming policy 통과 + repo allowlist
  - 같은 이름 브랜치 존재 시 거절(덮어쓰기 금지)

commit:
  - 운영자 승인 + diff preview(파일·라인 수·실제 patch) + target branch allowlist
  - dry-run(git apply --check 동급) 통과 후에만
  - 기본 브랜치(main 등) 직접 커밋 금지 — 작업 브랜치에만

pr_create:
  - 운영자 승인 + base/head allowlist + 제목/본문 preview
  - base가 기본 브랜치여도 PR은 머지가 아니므로 허용하되, 자동 머지 절대 금지
```

기존 [B/C](99-github-readonly-connector.md) 작업의 ApprovalQueueItem `commandPreview`/evidence
배선을 그대로 재사용한다: write는 진짜 payload를 commandPreview로 싣고, "안전 검증 항목 일괄
승인(C)"에는 **절대 포함되지 않는다**(write는 read/verify kind가 아니므로 자동 제외).

## 4. diff / payload preview

```text
commit/PR:
  - 서버가 실제 보낼 payload를 그대로 preview로 만든다(파일 경로·patch·base/head·메시지).
  - preview는 redacted(토큰·헤더 제외)이지만 내용은 마스킹하지 않는다(운영자가 정확히 봐야 함).
  - private repo 본문은 trace에는 redacted summary로만, preview는 운영자 화면에만.
comment:
  - 보낼 코멘트 본문 그대로 preview.
```

## 5. repo allowlist / branch naming policy

```text
repo allowlist:
  - 서버 env(예: GITHUB_WRITE_ALLOWED_REPOS="owner/repo,owner/repo2")로만 지정.
  - allowlist에 없으면 write 도구가 not_allowed로 정직 거절(라우트 레벨).
  - read allowlist와 분리(읽기 허용 ≠ 쓰기 허용).

branch naming policy:
  - 새 브랜치는 접두사 강제(예: ai/, agent/, mission/<id>/).
  - main/master/release/* 등 보호 브랜치 이름으로 생성/커밋 금지.
  - 정규식 검증 + 인코딩(D3의 path injection 방어와 동일 패턴).
```

## 6. token scope

```text
- write에는 read보다 넓은 스코프가 필요(repo write / contents:write / pull_requests:write).
- 서버가 토큰 스코프를 확인해, write 스코프가 없으면 권한 부족(permission_denied)으로 거절.
- 토큰은 여전히 서버 env에만. 브라우저/응답/이벤트 로그/trace에 토큰 미포함(D 원칙 유지).
- write 토큰과 read 토큰을 분리 권장(최소 권한). read-only 운영 시 write 토큰 미설정.
```

## 7. rollback / checkpoint

```text
- commit/branch_create는 실행 전 checkpoint를 남긴다(G2의 checkpoint runner 재사용 가능).
- 되돌리기 경로:
  - comment → delete comment(별도 승인)
  - branch_create → delete branch(별도 승인, 보호 브랜치 아님 확인)
  - commit → revert commit 또는 브랜치 reset(승인 필요, force 금지)
- rollback도 write이므로 동일 승인 게이트를 통과한다(자동 rollback 금지 — G2와 동일).
```

## 8. audit trace

```text
- 모든 write 시도/승인/실행/실패를 EventStorage에 redacted로 남긴다.
  예: github.write.requested / .approved / .executed / .failed
- payload는 redacted summary + evidenceRef(repo/branch/sha/url/observedAt)만.
  본문 diff 전체·토큰·헤더는 trace에 남기지 않는다.
- observed: GitHub 200을 실제로 받은 실행만. 승인 대기/preview는 planned.
```

## 9. dry-run

```text
- commit: 서버가 git apply --check 동급으로 patch 적용 가능성 검증(실제 push 없이).
- branch_create: 같은 이름 ref 존재 여부 사전 확인.
- pr_create: base/head 존재 + 충돌 여부 사전 확인.
- dry-run 실패면 실제 write 차단 + 정직한 사유 반환.
```

## 10. 활성화 절차 (구현 시)

```text
1. GITHUB_WRITE_ENABLED=true (서버 env) — 없으면 write 도구 자체가 노출 안 됨.
2. GITHUB_WRITE_ALLOWED_REPOS 설정.
3. write 스코프 토큰(별도) 설정.
4. 각 write는 ApprovalQueueItem 승인 + dry-run 통과 후 실행.
5. 실행은 observed로만 표시, 나머지는 planned.
```

## 11. 명시적 비목표 (이 단계에서 금지)

```text
- 자동/무인 write(승인 없는 실행) 금지.
- force-push / 기본 브랜치 직접 push / 자동 merge 금지.
- write 도구를 read-only 일괄 승인(C)에 포함 금지.
- MCP write tool 금지(D3는 read-only만; write MCP는 이 문서의 게이트 이후 별도 검토).
- repo 설정·secret·webhook 등 메타 변경 금지.
```

## 12. 구현 순서(나중에, 합의 후)

```text
W1. issue_comment / pr_comment (가장 약한 write, 승인+preview+allowlist+trace)
W2. branch_create (naming policy + dry-run)
W3. commit (diff preview + dry-run + checkpoint)
W4. pr_create
각 단계마다 적대적 정직성 리뷰(가짜 성공·자동 실행·토큰 누출·preview 불일치·allowlist 우회).
```
