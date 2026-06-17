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
