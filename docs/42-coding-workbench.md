# 42 — 코딩 워크벤치 (opencode급)

`코딩` 탭(작전 그룹). 채팅으로 코딩 에이전트를 부리는 opencode 스타일 표면 —
단, 모든 도구 실행이 이 OS의 승인·권한·리댁션 게이트를 통과한다는 점이 다르다.

## 상호작용 전체 목록

| 상호작용 | 구현 |
|---|---|
| 세션 | 좌측 목록, 새 세션/삭제/자동 제목, localStorage 영속 (`codingChatStore`) |
| 모델/프로바이더 | 좌측 셀렉터 (등록된 프로바이더 프로필 + 자유 모델 ID) |
| 에이전트 모드 | 빌드/플랜 토글 — 플랜 모드는 bash/write/edit 차단(읽기 도구만) |
| 스트리밍 | `/provider-completions/stream` SSE delta → 라이브 타이핑, 실패 시 비스트림 폴백 |
| 도구: bash | 게이트 dispatch→승인→replay→capture, 출력 카드(접기) |
| 도구: read/grep/glob | 게이트 통과 셸 매핑 (`sed`/`rg`/`find`) |
| 도구: write | quoted heredoc으로 게이트 통과 작성 |
| 도구: edit | 컬러 unified diff 카드 + "적용 (게이트 통과)" 버튼 (`git apply`/`patch`) |
| 도구: todo | 체크리스트 카드 (로컬) |
| 도구 루프 | 모델↔도구 라운드트립 자동 반복 (최대 8라운드), 결과가 다음 페이로드에 인라인 |
| 승인 모드 | 사람 승인 / safe 자동승인 (기존 createApprovalStrategy 재사용) |
| 중단 | 실행 중 중단 버튼 (협조적 취소 — 라운드/도구 사이에서 멈춤) |
| 슬래시 명령 | /new /sessions /models /compact /undo /clear /share /init /plan /build /help + 자동완성 메뉴 |
| @파일 멘션 | `@경로` → 시스템 프롬프트에 "먼저 read로 확인" 지시 |
| 체크포인트/undo | 턴 단위 체크포인트, /undo로 통째 롤백 |
| /compact | 오래된 메시지를 요약으로 접어 시스템 메시지로 주입 |
| /share | 대화 전체를 마크다운으로 클립보드 복사 |
| /init | 저장소 조사 후 AGENTS.md 초안 제안 턴 자동 시작 |
| 토큰 표시 | 누적 입력/출력 토큰 (usage 청크 합산) |
| 에러 | 상단 바 danger 배지 (서버 미가동 = "Failed to fetch") |

## 와이어 프로토콜

모델은 도구를 fenced block으로 호출한다:

    ```tool
    {"tool":"bash","command":"pnpm test"}
    ```

`parseAssistantReply`가 텍스트/도구 파트로 분해(불량 JSON은 텍스트로 보존),
`runCodingTurn`이 도구 실행 결과를 `[tool_result …]` 메시지로 되돌려 보내 루프.

## 코드 지도

- `lib/codingChat.ts` — 세션 모델·리듀서·파서·슬래시·멘션·압축 (순수)
- `lib/codingTurnRunner.ts` — 에이전트 루프 + 게이트 도구 실행기 (순수, effects 주입)
- `lib/codingAgentClient.ts` — completion SSE/비스트림 클라이언트
- `lib/codingChatStore.ts` — localStorage 영속
- `components/coding/CodingThread.tsx` — 메시지/툴카드/디프 렌더
- `components/coding/CodingWorkbench.tsx` — 컨테이너 (배선)

## 전제

서버(`apps/server`)가 떠 있고 프로바이더 프로필이 등록돼 있어야 실제 completion이
흐른다. 서버가 없으면 에러 배지로 명확히 표면화된다(조용한 실패 없음).
