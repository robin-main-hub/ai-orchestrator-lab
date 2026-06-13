# 83 — App Workspace primitive (Coding/Design OS D2)

방향 전환: 회사 업무 OS가 아니라 **개인용 Coding + Debate + Conversation + Design
Orchestration OS**. Dyad의 강점(로컬 앱 빌더 — 만들고 바로 보고 고친다)을 **코드 복붙이
아니라 패턴으로** 현재 Mission/EventStorage/SandboxRunner/Hermes 위에 흡수한다.

D2는 그 첫 primitive: **Mission에 붙는 App Workspace**(Dyad의 "앱 작업공간"에 대응).

## 한 일

- **protocol** `appWorkspace.ts`: `AppWorkspace`(repoRootRef/worktreeRef/appType/preview/
  terminal/files), `sandboxRunnerKindSchema`(local/docker/gvisor/tmux_observation),
  `appWorkspaceAttachRequestSchema`, `buildAppWorkspace`(순수). `ServerMissionRecord.workspaces`.
- **server**: `mission.workspace.attached` 이벤트 + missionIndex materialize(upsert by id),
  `store.attachWorkspace`, `POST /missions/:id/workspace`. trace에 `workspace.attached` 매핑.

## 불변식 (Dyad보다 권한 경계가 더 강하다)

- Workspace는 Mission에 붙는다. **source of truth 아님** — EventStorage가 진실, materialize된 뷰.
- **preview.port/url은 실제 관측 시만 observed** — attach 직후는 `not_started`/truthStatus
  `planned`(가짜 running 금지, 테스트로 못박음). 실제 포트 바인딩 관측은 후속 preview runner.
- terminal은 host shell 직결이 아니라 SandboxRunner/approval boundary 뒤. 이 primitive는
  **메타데이터만 기록** — 실제 실행은 기존 runner 경로로 간다.
- 재시작 후 복원(이벤트 소싱) — 테스트로 확인.

## Dyad 참고 원칙 (준수)

코드 복붙 0 · src/pro 미접근 · 패턴만 흡수(앱 작업공간이라는 UX 개념을 우리 이벤트/미션
모델로 재구현). 회사 도메인/회사명 하드코딩 0.

## 검증

protocol 77(+2) · server 231(+4) · desktop typecheck 그린. docs/83.

## 다음 (Coding/Design OS 순서)

D3 DesignBlueprint(디자인을 구조화된 Mission 입력) · D4 Preview runner(deterministic ports)
· D5 Visual QA/DesignIssueCard · D6 Debate→Blueprint→Mission · D7 generic 앱/컴포넌트
템플릿 · D8 model/thinking/tool control strip · D9 generic app-build smoke.
