# 리서치 노트

## 참고 링크

- GeekNews tunaFlow 글: https://news.hada.io/topic?id=28826
- tunaFlow GitHub: https://github.com/hang-in/tunaFlow
- DCInside 토론 UI 글: https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=1181532
- connect-ai: https://github.com/wonseokjung/connect-ai
- Memento-MCP 글: https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=1206711
- Memento-MCP GitHub: https://github.com/JinHo-von-Choi/memento-mcp
- tmux Wiki: https://github.com/tmux/tmux/wiki
- OpenBSD tmux manual: https://man.openbsd.org/tmux.1
- tmux Control Mode: https://github.com/tmux/tmux/wiki/Control-Mode
- DCInside pending reference 1185913: https://m.dcinside.com/board/thesingularity/1185913

## tunaFlow에서 가져올 방향

- 데스크톱 오케스트레이터가 중심이다.
- CLI 기반 AI 에이전트를 실제 터미널 작업과 연결한다.
- 계획, 개발, 리뷰 흐름을 하나의 UI에서 관리한다.
- 사용자가 결과를 채택하거나 거절할 수 있어야 한다.

## 토론 UI에서 가져올 방향

- 여러 모델이 각자의 패널에서 발언한다.
- 발언의 성격이 분명해야 한다: 주장, 반박, 요약, 최종 판단.
- 토론 결과는 최종 요약에서 끝나지 않고 다음 행동으로 넘어가야 한다.

## connect-ai에서 가져올 방향

- 하나의 로컬 환경에서 여러 에이전트를 동시에 굴리는 구성.
- 하나의 API 또는 모델에서도 역할 분리로 여러 관점을 만든다.
- 로컬 우선 실행과 외부 모델 호출을 함께 다룬다.

## Memento-MCP에서 가져올 방향

- 기억은 단순 로그가 아니라 재사용 가능한 작업 맥락이다.
- 회상, 저장, 반성, 검토 큐가 필요하다.
- 장기 기억은 프로젝트/사용자/세션 단위로 격리되어야 한다.
- 어떤 기억이 결정에 영향을 줬는지 추적 가능해야 한다.

## tmux에서 가져올 방향

- detach/reattach 가능한 오래 사는 CLI agent session을 지원한다.
- MacBook 앱이 꺼지거나 SSH가 끊겨도 pane 상태를 다시 붙일 수 있게 한다.
- pane index보다 stable pane id를 우선한다.
- 실제 command dispatch 전에 read-only capture와 Event Store mapping을 먼저 만든다.
- control mode는 실시간 stream parser가 필요해진 뒤에 붙인다.
- DGX-02는 remote tmux host 후보이고, DGX-01은 사용자가 명시적으로 풀기 전까지 locked로 둔다.
