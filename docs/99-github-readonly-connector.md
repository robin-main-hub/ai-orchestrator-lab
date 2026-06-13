# 99 · GitHub 읽기 전용 커넥터 (read-only spike)

코딩 메뉴에서 GitHub를 **읽기 전용**으로 붙이는 커넥터 기능. "연결 기능"을 넣은 것이지
라이브로 연결해 둔 것이 아니다 — 토큰을 설정하기 전까지는 어떤 GitHub 호출도 일어나지 않는다.

## 설계 원칙

- **토큰은 서버 env에만.** 브라우저 번들·클라이언트 응답·이벤트 로그 어디에도 토큰이 실리지
  않는다. 데스크톱은 서버의 `/integrations/github/*` 라우트하고만 통신한다(프로바이더
  completion 프록시와 동일한 패턴).
- **읽기 전용 by construction.** 클라이언트는 GET만 발행하고 쓰기 메서드가 존재하지 않는다.
  라우트는 GET 외 메서드를 405로 거절한다.
- **가짜 연결 금지.** 토큰 미설정이면 status는 `configured: false`이고, 리소스 호출은 GitHub를
  치지 않고 "미설정" 안내만 반환한다.
- **비밀 누출 방지.** 에러 메시지에서 토큰 문자열을 마스킹한다. 큐/토스트에 명령을 노출할 때도
  redacted 값만 쓴다(작업 B/C 참고).

## 활성화 (서버 운영자)

서버 프로세스 env에 토큰을 설정한다. 공개 저장소이므로 토큰을 **절대 커밋하지 않는다**.

```bash
# 읽기 전용 스코프 권장: 퍼블릭만이면 public_repo, 프라이빗 포함이면 repo(read)
export GITHUB_TOKEN=ghp_xxx   # 서버 셸/시크릿 매니저에서만. 저장소에 커밋 금지.
```

설정 후 데스크톱 코딩 메뉴의 Mission Board 헤더 칩이 `GitHub 읽기전용: 연결됨`으로 바뀐다.

## 라우트 (모두 GET, 읽기 전용)

| 경로 | 설명 |
|---|---|
| `/integrations/github/status` | 커넥터 상태(토큰 유무, 필요한 스코프, 안내). 토큰 값은 미포함 |
| `/integrations/github/repos/:owner/:repo/overview` | 저장소 개요 요약 |
| `/integrations/github/repos/:owner/:repo/pulls` | PR 목록 요약(`?state=open\|closed\|all`) |
| `/integrations/github/repos/:owner/:repo/pulls/:number` | PR 상세(본문·base/head·diff stat) |
| `/integrations/github/repos/:owner/:repo/issues` | 이슈 목록 요약(PR 제외) |

### 정직한 outcome (D1)

리소스 응답은 `outcome`으로 결과를 정직하게 구분한다 — 빈 목록이 "PR 없음"으로 오인되지
않게 한다. 기존 `TruthStatus` 어휘(`observed` = 실제 200)를 재사용한다.

| outcome | 의미 | UI 라벨 |
|---|---|---|
| `observed` | 실제 GitHub HTTP 200 — `observedAt` 동반 | 관측됨 |
| `not_configured` | 토큰 미설정 — GitHub 미호출 | 미설정 |
| `permission_denied` | 401/403 — 스코프/접근 권한 부족 | 권한 부족 |
| `connection_failed` | network/0 — GitHub 도달 실패 | 연결 실패 |
| `github_error` | 기타 GitHub 오류 | GitHub 오류 |

## D1 데이터 표면 (코딩 워크벤치 패널)

코딩 워크벤치 Mission Board 하단에 `GithubPullRequestPanel`이 붙는다:
- 미설정이면 안내만 표시하고 GitHub를 호출하지 않는다(상태만 조회).
- `owner/repo` 입력 + "PR 불러오기"로 PR 목록을 명시적으로 조회(자동 조회 아님).
- 실제 200 데이터만 "관측됨" + `observedAt`으로 표시. 권한 부족/연결 실패/오류는 각각 구분.
- PR 클릭 → 상세(본문·base←head·diff stat·GitHub 링크). 쓰기 컨트롤 없음.
- 결과를 모델 컨텍스트에 자동 주입하지 않는다(그건 D2).

## 코드

- `packages/protocol/src/githubConnector.ts` — status/PR/issue/repo 요약 타입 + 응답 스키마
- `apps/server/src/integrations/githubReadonlyClient.ts` — 순수 read-only 클라이언트(주입식 fetch + 토큰 마스킹)
- `apps/server/src/routes/github.ts` — `handleGithubRoute`(GET 전용, 미설정 안내)
- `apps/desktop/src/lib/githubConnector.ts` — 데스크톱 클라이언트 + 칩 라벨(정직 상태)
- `apps/desktop/src/components/coding/GithubConnectorChip.tsx` — Mission Board 상태 칩

## 다음 단계 (이번 스파이크 범위 밖)

- PR/이슈 목록을 코딩 메뉴 패널에 렌더(현재는 상태 칩 + 클라이언트 함수까지).
- 커넥터를 MCP 도구로 노출해 에이전트가 read-only 조회를 직접 호출.
- 토큰 스코프 검증(레이트리밋·권한 부족 시 사용자 안내).
