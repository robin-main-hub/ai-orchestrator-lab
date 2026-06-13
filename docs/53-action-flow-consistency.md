# 53 — 액션 동선 일관화 (디자인 정리 3탄)

디자인 리뷰 지적: "액션 동선 단절 — 같은 일을 화면마다 다르게, 클릭 수도 제각각."
승인(Control Queue) 진입이 대표 사례였다.

## 문제: 같은 동작, 다른 이름 + 다른 숫자

정찰로 드러난 두 가지 불일치:

1. **진입 클로저가 이름만 다른 채 6곳에 흩어짐** — 화면마다
   `() => setApprovalDrawerOpen(true)`를 `onOpenApprovalQueue` / `onOpenControlQueue`
   / `onPreviewEvidence` / `onViewApproval` 등 서로 다른 prop으로 개별 전달. 같은
   드로어를 여는데 "우연히 같은 동작"이었다.

2. **배지 숫자가 열리는 내용과 어긋남** — 드로어(ControlQueueDrawer)는 로컬 권한 +
   서버 승인을 합친 `unifiedControlQueueSnapshot`을 보여주는데, 상단 툴바 "Queue N"과
   대시보드 펄스 "승인 대기 N건"은 로컬만 센 `permissionSnapshot.summary.pending`을
   표시했다. 서버 승인이 있으면 **배지엔 2, 열면 3** — 클릭한 숫자가 거짓이 된다.

## 한 진입점 · 한 숫자

- **단일 명명 핸들러**: `openControlQueue()` / `toggleControlQueue()`를 App에 한 번
  정의하고, 흩어져 있던 인라인 클로저 전부(툴바·대시보드·콕핏·운영레일·자율실행·
  WorkTrace·Annex·명령 팔레트·전역 단축키 ⌘⇧A)를 이걸로 통일. "Control Queue 열기"가
  코드에서도 한 곳이 됐다 — 나중에 계측/포커스 타깃을 얹을 자연스러운 지점.
- **배지 단일 소스**: 툴바 "Queue N" + needs-attention, 대시보드 `pendingApprovals`를
  모두 `unifiedControlQueueSnapshot.summary.pending`으로 통일. 이제 앱 어디서 보든
  "승인 대기 수" = 드로어가 여는 큐의 길이 = 대시보드 건강 롤업의 "승인 N"
  (콕핏 snapshot.approvals도 같은 unified 큐에서 도출). 한 상태에 한 숫자.

## 제자리 처리는 그대로 둔다

가장 강한 in-place 패턴(대화 버블 안 허용/거절 3버튼, 미션보드 카드 안 검증/머지)은
손대지 않는다 — 이미 "같은 자리에서 처리"의 모범. 이번 패스는 *진입의 일관성*
(어디서 눌러도 같은 드로어·같은 숫자)에 집중했고, in-place 영역은 보존했다.

## 원칙

- **한 동작엔 한 이름**: 같은 결과를 내는 진입은 한 핸들러로.
- **거짓말하지 않는다(숫자판)**: 배지가 가리키는 수와 열리는 내용이 어긋나지 않게.
- **회귀 0**: 동작 동일(드로어 open/toggle 그대로), 카운트는 더 정확해짐. 순수
  리팩터 + 정확화. desktop 스위트 1094 그린.

## 다음 디자인 타깃

여백·밀도 패스(spacing 토큰 부재가 근본), 그리고 마지막 네비 축 통합.
