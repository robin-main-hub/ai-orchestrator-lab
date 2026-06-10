# 44 — 리서치 스웜 (Kimi Agent Swarm + Manus research)

`리서치` 탭. 여러 페르소나 요원이 한 주제를 각자의 시점에서 병렬 조사하고,
활동을 실시간 타임라인으로 보여주며, 노트를 합본 보고서로 남긴다.

## 화면 (사용자가 지목한 Kimi/Manus 장점)

- **마스터 플랜** (Manus 좌측): 단계 체크리스트 + `Task Progress x/y`
- **요원 명단** (Kimi 좌측): 아바타 + 한 줄 임무 + 진행 도트 + Viewing/번호
- **Agent's Computer** (Kimi 우측): 선택 요원의 활동 타임라인
  (Think / Write Todo / Search N results / Browsing / Execute Terminal /
  Creating file — 접고 펼치기)
- **요원 스트립** (Kimi 하단): 아바타 + 번호 + 회전 동사 상태
- **합본 보고서** (Manus 산출물): 요원별 노트 → 목차 포함 마크다운 다운로드

## 설계 결정 — 적대 검증을 먼저 통과

구현 전 워크플로로 통합점 매핑 + 적대적 설계 검증을 돌렸고, 검증이 **설계가
기존 게이트·tmux 라우팅과 양립 불가능한 3대 치명점**을 짚었다. 그래서 1차는
이를 *회피하는* 견고한 형태로 만들었다:

| 적대 검증 결함 | 1차 대응 |
|---|---|
| #1 게이트가 curl/heredoc/파이프 차단 → search·browse·write 0% 통과 | **completion 기반**으로 전환 — tmux/curl 게이트를 아예 타지 않는다. 도구 실행기는 주입식(`ResearchStepExecutor`)이라 서버측 검색 프록시가 생기면 교체만 |
| #2 dispatch는 전송 완료에 resolve → capture 레이스 | 기본 경로가 네트워크 셸 명령을 안 씀. 게이트 실행기 도입 시 완료 센티널 폴링 필요(백로그) |
| #3 pane 라우팅 role 단일 → N 동시 오염 | completion은 pane 무관. 요원별 독립 conversation |
| #4 write_file 경로 인젝션/탈출 | `researchWorkspace.safeNotePath` — research/ 강제, `..`·절대경로·홈 거부, 슬러그화. 테스트로 인젝션 차단 고정 |
| #5 서버 다운 → 조용한 멈춤 | completion 실패를 **헬스체크로 사용** → 전원 `offline` + 명확한 배너. 라이브로 검증(서버 죽은 상태에서 정확히 작동) |
| #9 진행도트/동사 괴리 | 도트는 무비용 think 제외 **산출 스텝(done)만**, 동사에 offline 상태 추가 |
| #10 마스터플랜이 failed도 녹색 | `derivePlanProgress`를 **성공(done) 증거 기반**으로 — 전원 실패 시 보고 단계는 회색. 별도 `failedAgentCount` 경고 배지 |
| #12 maxRounds 8 코딩용 | 리서치 전용 `RESEARCH_DEFAULT_MAX_ROUNDS=16` + 종료 임박 리마인더 |

## 코드

- `lib/researchSwarm.ts` — 순수 모델/리듀서 (스텝·동사·진행·플랜)
- `lib/researchSwarmRunner.ts` — 스텝 펜스 파서 + 요원 루프 + 주입식 실행기
  (기본 `createKnowledgeStepExecutor` = 지식 기반, 서버 무관)
- `lib/researchWorkspace.ts` — 경로 검증 + 노트/보고서 빌더
- `components/research/ResearchAgentComputer.tsx` — 우측 타임라인
- `components/research/ResearchSwarmContainer.tsx` — 전체 + 배선

## 와이어 프로토콜

요원은 스텝을 펜스로 낸다:

    ```step
    {"kind":"search","query":"opencode multi-agent","title":"...","detail":"왜"}
    ```

`kind`: think · todo · search · browse · terminal · write_file. 텍스트는 think,
펜스 없는 꼬리는 결론. 마지막에 write_file로 노트를 남기고 결론을 정리하면 종료.

## 백로그 (서버측 — 권한 필요)

1차는 실시간 웹검색을 하지 않는다(지식 기반). Kimi처럼 실검색을 붙이려면 **서버
변경**이 필요하고 이는 dgx-02 인프라 작업이라 별도 승인이 필요하다:

1. **서버 검색 프록시 엔드포인트** — 고정 파서·캐시·레이트리밋·HTTP 상태 검증
   (적대 검증 #6 #7). 클라이언트 셸 curl 파싱은 운영 부채.
2. **게이트 도구 실행기** — 완료 센티널(`echo __DONE_<id>_$?__`) + 백오프 폴링
   capture (#2), `--pane-id` 직접 라우팅 + 동적 research pane 생성 (#3),
   research/ 한정 파일쓰기 엔드포인트 (#4 #11).
3. **워크로드별 모델 라우팅** — 계획=저가, 종합=고가 (논문 교훈).
4. **React 상태 분리** — 요원별 store/셀렉터로 리렌더 격리 (#8, 요원 수가
   커지면).

지금은 1차(completion-only)로 충분히 동작하며, 서버가 살아 있고 프로바이더가
설정되면 6요원이 실제로 병렬 조사하고 보고서를 내려받을 수 있다.
