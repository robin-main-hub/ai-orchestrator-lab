import type { CommandEntry } from "../components/CommandPalette";
import type { InboxCommand } from "../components/inbox/AssistantInbox";
import type { UserSavedView } from "./userSavedViews";

/**
 * Batch 12 LINE A — pure builder for the Assistant Inbox's Command Palette
 * entries. Extracted from App so the wiring is unit-testable: each entry's run()
 * only invokes the injected view handlers (nav + a view-only command dispatch).
 *
 * Every command is VIEW-ONLY — it navigates or sets inbox view state. None
 * sends / writes / runs / approves / dispatches a runner. (no side-effect action)
 */
export type InboxPaletteHandlers = {
  /** Navigate to the Assistant Inbox surface (command_center). */
  goInbox: () => void;
  /** Navigate to the inbox AND push a one-shot view command (nav + command). */
  dispatch: (kind: InboxCommand["kind"], value?: string) => void;
  /** Navigate to the inbox AND apply a user saved view (view-only). */
  applyView: (view: UserSavedView) => void;
};

export function buildInboxPaletteCommands(
  h: InboxPaletteHandlers,
  userViews: ReadonlyArray<UserSavedView> = [],
): CommandEntry[] {
  return [
    {
      id: "inbox.goto",
      verb: "이동",
      label: "Assistant Inbox 열기",
      hint: "작전극장 / command center",
      run: () => h.goInbox(),
    },
    { id: "inbox.live", verb: "전환", label: "LIVE 좌석", hint: "실제 app state", run: () => h.dispatch("mode", "live") },
    {
      id: "inbox.preview",
      verb: "전환",
      label: "PREVIEW 좌석",
      hint: "예시(fixture) 시나리오 덱",
      run: () => h.dispatch("mode", "preview"),
    },
    {
      id: "inbox.replay",
      verb: "전환",
      label: "REPLAY 좌석",
      hint: "과거 eventLog 재생(read-only)",
      run: () => h.dispatch("mode", "replay"),
    },
    {
      id: "inbox.blocked",
      verb: "포커스",
      label: "Blocked 보기",
      hint: "포커스=blocked",
      run: () => h.dispatch("focus", "blocked"),
    },
    {
      id: "inbox.runner",
      verb: "필터",
      label: "Runner 필터",
      hint: "카테고리=runner",
      run: () => h.dispatch("category", "runner"),
    },
    {
      id: "inbox.failures",
      verb: "필터",
      label: "Failures 필터",
      hint: "카테고리=failure",
      run: () => h.dispatch("category", "failure"),
    },
    {
      id: "inbox.clear",
      verb: "초기화",
      label: "Inbox 필터 초기화",
      hint: "검색/카테고리/포커스 해제",
      run: () => h.dispatch("clear"),
    },
    // Batch 15 LINE D — jump to the Source Dock (외부 소스 갑판). View/move only:
    // scrolls + focuses the dock section; never syncs/runs/dispatches a source.
    {
      id: "inbox.sourceDock",
      verb: "이동",
      label: "Source Dock 열기",
      hint: "외부 소스 보기 · 화면 이동만",
      run: () => h.dispatch("focusSection", "source-dock"),
    },
    // Batch 17 LINE D — jump to the Patch Candidate lane. View/move only:
    // scrolls + focuses the lane; never applies/commits/dispatches a patch.
    {
      id: "inbox.patchCandidates",
      verb: "이동",
      label: "Patch Candidates 열기",
      hint: "패치 후보 보기 · 적용 없음",
      run: () => h.dispatch("focusSection", "patch-candidates"),
    },
    {
      id: "inbox.workItemCandidates",
      verb: "이동",
      label: "WorkItem Candidates 열기",
      hint: "작업 후보 보기 · 확정 없음",
      run: () => h.dispatch("focusSection", "work-item-candidates"),
    },
    {
      id: "inbox.candidateReview",
      verb: "이동",
      label: "Candidate Review 열기",
      hint: "후보 리뷰 보기 · 확정 없음",
      run: () => h.dispatch("focusSection", "work-item-candidate-review"),
    },
    {
      id: "inbox.candidateReviewReady",
      verb: "보기",
      label: "Ready Candidates 보기",
      hint: "준비 후보 보기 · 확정 없음",
      run: () => h.dispatch("focusSection", "work-item-candidate-review-ready"),
    },
    {
      id: "inbox.candidateReviewMissingEvidence",
      verb: "보기",
      label: "Missing Evidence 보기",
      hint: "근거 부족 후보 보기 · 확정 없음",
      run: () => h.dispatch("focusSection", "work-item-candidate-review-needs-evidence"),
    },
    {
      id: "inbox.candidateReviewBlocked",
      verb: "보기",
      label: "Blocked Candidates 보기",
      hint: "막힌 후보 보기 · 확정 없음",
      run: () => h.dispatch("focusSection", "work-item-candidate-review-blocked"),
    },
    // Batch 25 LINE J — jump to the Operator Console (status strip). View/move only:
    // scrolls + focuses the console region; never reads/writes a server.
    {
      id: "inbox.operatorConsole",
      verb: "이동",
      label: "Operator Console 열기",
      hint: "오퍼레이터 콘솔 보기 · 화면 이동만",
      run: () => h.dispatch("focusSection", "operator-console"),
    },
    // Batch 25 LINE J — jump to the SANDBOX seat (proposal-only shell). Seat switch
    // only — the sandbox itself never executes / dispatches anything.
    {
      id: "inbox.sandbox",
      verb: "전환",
      label: "SANDBOX 좌석",
      hint: "제안 전용 시나리오 · 실행 없음",
      run: () => h.dispatch("mode", "sandbox"),
    },
    // Batch 25 LINE J — jump to the Evidence Draft card (PREVIEW-only footnote
    // surface). View/move only: scrolls + focuses the draft; never sends/asks externally.
    {
      id: "inbox.evidenceDraft",
      verb: "이동",
      label: "Evidence Draft 열기",
      hint: "근거 footnote 초안 보기 · PREVIEW 전용",
      run: () => h.dispatch("focusSection", "evidence-draft"),
    },
    // Batch 12 LINE D — user saved views as palette commands (view-only apply).
    ...userViews.map((v) => ({
      id: `inbox.view.${v.id}`,
      verb: "뷰",
      label: `인박스 뷰 적용: ${v.name}`,
      hint: "로컬 저장 뷰 · 부작용 없음",
      run: () => h.applyView(v),
    })),
  ];
}
