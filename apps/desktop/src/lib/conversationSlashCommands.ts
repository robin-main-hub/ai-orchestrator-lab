/**
 * Slash commands for the conversation workbench (items 4, 6, 7). This is a
 * deliberate subset of the coding workbench's parser — the conversation menu
 * only exposes session-level controls, not file/tool commands.
 */

export type ConversationSlashCommand =
  | { kind: "fork"; task?: string }
  | { kind: "compact" }
  | { kind: "plan" }
  | { kind: "build" }
  | { kind: "help" }
  | { kind: "unknown"; name: string };

/** null when the text is not a slash command (regular chat message) */
export function parseConversationSlashCommand(text: string): ConversationSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const match = /^\/(\S+)(?:\s+([\s\S]+))?$/.exec(trimmed);
  if (!match) return null;
  const name = match[1]!.toLowerCase();
  const rest = match[2]?.trim();

  switch (name) {
    case "fork":
      return { kind: "fork", task: rest || undefined };
    case "compact":
      return { kind: "compact" };
    case "plan":
      return { kind: "plan" };
    case "build":
      return { kind: "build" };
    case "help":
      return { kind: "help" };
    default:
      return { kind: "unknown", name };
  }
}

export const CONVERSATION_SLASH_HELP = [
  "사용 가능한 명령:",
  "/fork [작업 설명] — 현재 대화를 미션으로 분기",
  "/compact — 대화 컨텍스트를 수동으로 압축",
  "/plan — PLAN 모드(읽기 전용 도구만 허용)로 전환",
  "/build — BUILD 모드(모든 도구 허용)로 전환",
  "/help — 이 도움말 표시",
].join("\n");
