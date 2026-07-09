import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import type { ApprovalToastRequesterContext } from "../lib/approvalToastBar";

/**
 * 전역 승인 toast bar 커넥터 — 완전 자동(full-auto) 이후 비활성(항상 null 렌더).
 *
 * 배경: 앱은 사람 승인 게이트가 없는 full-auto다(PR #1089). 승인은 서버 grant 경로로
 * 자동 해소되어 append-only 감사에만 남는다(로깅이지 게이트 아님). 따라서 화면 하단에 떠서
 * 원터치 "허용/거절"을 요구하던 전역 승인 팝업은 죽은 사람용 크롬이다 — 아무 UI도 만들지 않는다.
 *
 * 잔여 파생 권한 신호(createStage9PermissionSnapshot)가 통합 큐에 "required" 항목을 남겨도
 * 이 커넥터는 팝업을 띄우지 않는다. 사람 접점은 예산 상한과 중지 버튼뿐 — "목적만 주면 자율완주".
 *
 * 배선(queue/requester/onApprove/onReject/onOpenHistory)은 App.tsx 호환을 위해 유지한다.
 * 승인 이력은 Control Queue 드로어에서 계속 볼 수 있다(이 전역 팝업만 제거).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ApprovalToastBarConnector(_props: {
  queue: ApprovalQueueItem[];
  /** 세션 활성 에이전트/운영자 신원(best-effort). full-auto에선 미사용. */
  requester?: ApprovalToastRequesterContext;
  onApprove: (sourceItemId: string) => void;
  onReject: (sourceItemId: string) => void;
  onOpenHistory?: () => void;
}): null {
  // full-auto: 전역 사람 승인 팝업을 표면화하지 않는다.
  return null;
}
