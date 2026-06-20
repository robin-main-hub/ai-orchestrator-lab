import { describe, expect, it } from "vitest";
import {
  CONVERSATION_SLASH_HELP,
  parseConversationSlashCommand,
  type ConversationSlashCommand,
} from "./conversationSlashCommands";

// Characterization tests (no behavior change) for CONVERSATION_SLASH_HELP, the
// only export in conversationSlashCommands.ts the existing
// conversationSlashCommands.test.ts leaves unasserted (that suite pins
// parseConversationSlashCommand alone — null/fork/case-insensitive/unknown — but
// never the help copy). CONVERSATION_SLASH_HELP is the user-facing menu of
// session-level commands; it shares a load-bearing lockstep invariant with the
// parser switch: every command advertised in the help text MUST parse to a known
// (non-"unknown") kind, and the advertised set MUST exactly equal the non-unknown
// command kinds. If a future edit adds a parser case without a help line (or a
// help line for a command the parser forgot), this surfaces.

// The non-"unknown" kinds the parser can emit. "fork" carries an optional task.
const ADVERTISED_KINDS: Exclude<ConversationSlashCommand["kind"], "unknown">[] = [
  "fork",
  "compact",
  "plan",
  "build",
  "help",
];

describe("CONVERSATION_SLASH_HELP", () => {
  it("is a header line plus one line per advertised command", () => {
    const lines = CONVERSATION_SLASH_HELP.split("\n");
    expect(lines[0]).toBe("사용 가능한 명령:");
    const commandLines = lines.slice(1);
    expect(commandLines).toHaveLength(ADVERTISED_KINDS.length);
    for (const line of commandLines) {
      expect(line.startsWith("/"), line).toBe(true);
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it("advertises exactly the non-unknown command kinds, in parser order", () => {
    const advertisedNames = CONVERSATION_SLASH_HELP.split("\n")
      .slice(1)
      .map((line) => /^\/(\S+)/.exec(line)?.[1]);
    expect(advertisedNames).toEqual([...ADVERTISED_KINDS]);
  });

  it("every advertised command parses to a known (non-unknown) kind (lockstep)", () => {
    for (const line of CONVERSATION_SLASH_HELP.split("\n").slice(1)) {
      const name = /^\/(\S+)/.exec(line)?.[1];
      expect(name, line).toBeTruthy();
      const parsed = parseConversationSlashCommand(`/${name}`);
      expect(parsed, line).not.toBeNull();
      expect(parsed!.kind, line).not.toBe("unknown");
      expect(ADVERTISED_KINDS, line).toContain(parsed!.kind);
    }
  });
});
