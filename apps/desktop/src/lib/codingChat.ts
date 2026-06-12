/**
 * 코딩 워크벤치 — pure session model, reducer, and protocol parsers.
 *
 * The chat tab evolves into an opencode-style coding surface: the assistant
 * drives real tools (bash/read/grep/glob/write/edit/todo) through the same
 * permission/approval/redaction gate as everything else in the OS. This module
 * is the side-effect-free core: session state, the tool-call wire protocol
 * (fenced ```tool JSON blocks), slash commands, @file mentions, checkpoints,
 * compaction. The runner (codingTurnRunner) and the React container build on it.
 */

import {
  condense,
  estimateTokens,
  renderCondensate,
  shouldWithholdCondensation,
  type CondenserTurn,
} from "./conversationCondenser";

export type CodingToolName = "bash" | "read" | "grep" | "glob" | "write" | "edit" | "todo";

export type ToolStatus = "proposed" | "pending_approval" | "running" | "completed" | "failed" | "denied";

export type ToolCall = {
  id: string;
  tool: CodingToolName;
  /** one-line summary shown on the card header */
  title: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  output?: string;
  error?: string;
};

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "tool"; call: ToolCall };

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  parts: ChatPart[];
  createdAt: string;
};

export type AgentMode = "build" | "plan";

export type SessionStatus = "idle" | "thinking" | "tooling" | "waiting_approval" | "error" | "done";

export type Checkpoint = {
  id: string;
  label: string;
  /** message count at checkpoint time — undo truncates back to this */
  messageCount: number;
  createdAt: string;
};

export type CodingSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  agentMode: AgentMode;
  providerProfileId: string;
  modelId: string;
  messages: ChatMessage[];
  usage: { inputTokens: number; outputTokens: number };
  checkpoints: Checkpoint[];
  redoStack?: ChatMessage[][];
  error?: string;
  /** summary inserted by /compact, prepended to the provider payload */
  compactedSummary?: string;
};

export function createCodingSession(input: {
  id: string;
  now: string;
  providerProfileId?: string;
  modelId?: string;
  title?: string;
}): CodingSession {
  return {
    id: input.id,
    title: input.title ?? "새 코딩 세션",
    createdAt: input.now,
    updatedAt: input.now,
    status: "idle",
    agentMode: "build",
    providerProfileId: input.providerProfileId ?? "",
    modelId: input.modelId ?? "",
    messages: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    checkpoints: [],
  };
}

function touch(session: CodingSession, now: string): CodingSession {
  return { ...session, updatedAt: now };
}

export function appendUserMessage(
  session: CodingSession,
  input: { id: string; text: string; now: string },
): CodingSession {
  const message: ChatMessage = {
    id: input.id,
    role: "user",
    parts: [{ type: "text", text: input.text }],
    createdAt: input.now,
  };
  const title =
    session.messages.length === 0 && session.title === "새 코딩 세션"
      ? input.text.slice(0, 48)
      : session.title;
  return touch({ ...session, title, messages: [...session.messages, message], redoStack: [], status: "thinking", error: undefined }, input.now);
}

export function beginAssistantMessage(
  session: CodingSession,
  input: { id: string; now: string },
): CodingSession {
  const message: ChatMessage = { id: input.id, role: "assistant", parts: [], createdAt: input.now };
  return touch({ ...session, messages: [...session.messages, message] }, input.now);
}

function mapMessage(
  session: CodingSession,
  messageId: string,
  map: (message: ChatMessage) => ChatMessage,
): CodingSession {
  return {
    ...session,
    messages: session.messages.map((message) => (message.id === messageId ? map(message) : message)),
  };
}

/** streaming text: replace (not append) the trailing text part of the message */
export function setAssistantDraftText(
  session: CodingSession,
  input: { messageId: string; text: string; now: string },
): CodingSession {
  return touch(
    mapMessage(session, input.messageId, (message) => {
      const parts = [...message.parts];
      const last = parts[parts.length - 1];
      if (last && last.type === "text") {
        parts[parts.length - 1] = { type: "text", text: input.text };
      } else if (input.text.length > 0) {
        parts.push({ type: "text", text: input.text });
      }
      return { ...message, parts };
    }),
    input.now,
  );
}

/** finalize an assistant reply: replace the draft with parsed text+tool parts */
export function setAssistantParts(
  session: CodingSession,
  input: { messageId: string; parts: ChatPart[]; now: string },
): CodingSession {
  return touch(
    mapMessage(session, input.messageId, (message) => ({ ...message, parts: input.parts })),
    input.now,
  );
}

export function updateToolCall(
  session: CodingSession,
  input: { messageId: string; call: Partial<ToolCall> & { id: string }; now: string },
): CodingSession {
  return touch(
    mapMessage(session, input.messageId, (message) => ({
      ...message,
      parts: message.parts.map((part) =>
        part.type === "tool" && part.call.id === input.call.id
          ? { type: "tool", call: { ...part.call, ...input.call } }
          : part,
      ),
    })),
    input.now,
  );
}

export function setSessionStatus(session: CodingSession, status: SessionStatus, now: string): CodingSession {
  return touch({ ...session, status }, now);
}

export function setSessionError(session: CodingSession, error: string, now: string): CodingSession {
  return touch({ ...session, status: "error", error }, now);
}

export function addUsage(
  session: CodingSession,
  usage: { inputTokens?: number; outputTokens?: number },
  now: string,
): CodingSession {
  return touch(
    {
      ...session,
      usage: {
        inputTokens: session.usage.inputTokens + (usage.inputTokens ?? 0),
        outputTokens: session.usage.outputTokens + (usage.outputTokens ?? 0),
      },
    },
    now,
  );
}

/** checkpoint before each user turn so /undo can rewind whole turns */
export function pushCheckpoint(
  session: CodingSession,
  input: { id: string; label: string; now: string },
): CodingSession {
  return {
    ...session,
    checkpoints: [
      ...session.checkpoints,
      { id: input.id, label: input.label, messageCount: session.messages.length, createdAt: input.now },
    ],
  };
}

/** /undo — rewind to the latest checkpoint (drops the last turn) */
export function undoToLastCheckpoint(session: CodingSession, now: string): CodingSession {
  const checkpoint = session.checkpoints[session.checkpoints.length - 1];
  if (!checkpoint) return session;
  const dropped = session.messages.slice(checkpoint.messageCount);
  return touch(
    {
      ...session,
      messages: session.messages.slice(0, checkpoint.messageCount),
      checkpoints: session.checkpoints.slice(0, -1),
      redoStack: dropped.length > 0 ? [...(session.redoStack ?? []), dropped] : (session.redoStack ?? []),
      status: "idle",
      error: undefined,
    },
    now,
  );
}

/** /redo — re-apply the most recently undone turn snapshot. */
export function redoLastUndo(session: CodingSession, now: string): CodingSession {
  const stack = session.redoStack ?? [];
  const restored = stack[stack.length - 1];
  if (!restored || restored.length === 0) return session;
  return touch(
    {
      ...session,
      messages: [...session.messages, ...restored],
      redoStack: stack.slice(0, -1),
      status: "idle",
      error: undefined,
    },
    now,
  );
}

/** /compact — fold all but the last `keepTurns` messages into a summary stub */
/** 코딩 메시지를 응축기 입력 턴으로 — 도구 호출은 제목+상태, 실패 출력은 머리·꼬리 보존 */
function messageToCondenserText(message: ChatMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") return part.text;
      const status = part.call.status === "failed" ? "error" : "ok";
      const base = `[tool: ${part.call.title} → ${status}]`;
      if (part.call.status === "failed" && part.call.output) {
        const out = part.call.output;
        const head = out.slice(0, 200);
        const tail = out.length > 400 ? ` … ${out.slice(-200)}` : "";
        return `${base} ${head}${tail}`;
      }
      return base;
    })
    .join(" ");
}

export function compactSession(session: CodingSession, input: { keepMessages?: number; now: string }): CodingSession {
  const keep = input.keepMessages ?? 6;
  if (session.messages.length <= keep) return session;
  const dropped = session.messages.slice(0, session.messages.length - keep);

  // MT-OSC 추출형 응축 — 기계적 160자 잘림 대신 핵심 정보 클래스(파일경로/에러/결정/숫자/정정)
  // 보존. 이전 요약을 prior 쌍으로 접어 재응축하므로 요약이 단조 증가하지 않는다.
  const priorPair = session.compactedSummary
    ? { humanInput: "(이전 압축 요약)", assistant: session.compactedSummary, reasoning: "prior" }
    : undefined;
  const window: CondenserTurn[] = dropped.map((message) => ({
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    text: messageToCondenserText(message),
  }));
  const condensate = condense({
    prior: priorPair ? { pairs: [priorPair], tokenEstimate: estimateTokens(session.compactedSummary ?? ""), version: 0 } : null,
    window,
  });

  return touch(
    {
      ...session,
      messages: session.messages.slice(session.messages.length - keep),
      compactedSummary: renderCondensate(condensate),
      checkpoints: [],
      redoStack: [],
    },
    input.now,
  );
}

/** usage 기반 자동 응축 임계 (마지막 요청 입력 토큰이 이를 넘으면 /compact 권장) */
export const AUTO_COMPACT_INPUT_TOKEN_THRESHOLD = 12000;

/**
 * 이번 응축을 진행해도 되는지(Decider) — 활발한 리파인먼트 아크면 보류해 보호.
 * force=true(수동 /compact)면 항상 진행.
 */
export function shouldAutoCompact(session: CodingSession, lastInputTokens: number, force = false): boolean {
  if (force) return session.messages.length > 6;
  if (lastInputTokens <= AUTO_COMPACT_INPUT_TOKEN_THRESHOLD) return false;
  if (session.messages.length <= 6) return false;
  const dropped = session.messages.slice(0, session.messages.length - 6);
  const turns: CondenserTurn[] = dropped.map((message) => ({
    role: message.role === "user" ? "user" : "assistant",
    text: messageToCondenserText(message),
  }));
  return !shouldWithholdCondensation(turns);
}

// ─── assistant reply wire protocol ─────────────────────────────────────────
//
// The model emits tool invocations as fenced blocks:
//   ```tool
//   {"tool":"bash","command":"pnpm test"}
//   ```
// Everything else is plain text. parseAssistantReply splits a reply into
// ordered text/tool parts; invalid JSON blocks degrade to visible text so
// nothing is silently lost.

const TOOL_FENCE = /```tool\s*\n([\s\S]*?)```/g;

const TOOL_NAMES: ReadonlySet<string> = new Set(["bash", "read", "grep", "glob", "write", "edit", "todo"]);

export function toolTitle(tool: CodingToolName, input: Record<string, unknown>): string {
  switch (tool) {
    case "bash":
      return String(input.command ?? "").slice(0, 80) || "명령 실행";
    case "read":
      return `읽기 ${String(input.path ?? "")}`;
    case "grep":
      return `검색 "${String(input.pattern ?? "")}"`;
    case "glob":
      return `파일 찾기 ${String(input.pattern ?? "")}`;
    case "write":
      return `파일 쓰기 ${String(input.path ?? "")}`;
    case "edit":
      return `수정 ${String(input.path ?? "")}`;
    case "todo":
    default:
      return "할 일 목록";
  }
}

export function parseAssistantReply(
  text: string,
  makeId: (index: number) => string,
): { parts: ChatPart[]; toolCalls: ToolCall[] } {
  const parts: ChatPart[] = [];
  const toolCalls: ToolCall[] = [];
  let cursor = 0;
  let toolIndex = 0;
  TOOL_FENCE.lastIndex = 0;
  for (let match = TOOL_FENCE.exec(text); match; match = TOOL_FENCE.exec(text)) {
    const before = text.slice(cursor, match.index).trim();
    if (before) parts.push({ type: "text", text: before });
    cursor = match.index + match[0].length;
    const raw = match[1]!.trim();
    let parsed: Record<string, unknown> | null = null;
    try {
      const candidate = JSON.parse(raw) as Record<string, unknown>;
      if (candidate && typeof candidate === "object" && TOOL_NAMES.has(String(candidate.tool))) {
        parsed = candidate;
      }
    } catch {
      parsed = null;
    }
    if (!parsed) {
      parts.push({ type: "text", text: raw });
      continue;
    }
    const tool = String(parsed.tool) as CodingToolName;
    const { tool: _ignored, ...input } = parsed;
    const call: ToolCall = {
      id: makeId(toolIndex++),
      tool,
      title: toolTitle(tool, input),
      input,
      status: "proposed",
    };
    toolCalls.push(call);
    parts.push({ type: "tool", call });
  }
  const tail = text.slice(cursor).trim();
  if (tail) parts.push({ type: "text", text: tail });
  if (parts.length === 0) parts.push({ type: "text", text: "" });
  return { parts, toolCalls };
}

// ─── slash commands ─────────────────────────────────────────────────────────

export type SlashCommand =
  | { kind: "new" }
  | { kind: "sessions" }
  | { kind: "models" }
  | { kind: "compact" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "clear" }
  | { kind: "share" }
  | { kind: "init" }
  | { kind: "plan" }
  | { kind: "build" }
  | { kind: "fork"; role?: string; task?: string }
  | { kind: "missions" }
  | { kind: "attach"; missionId?: string }
  | { kind: "diff"; missionId?: string }
  | { kind: "verify"; missionId?: string }
  | { kind: "kill"; missionId?: string }
  | { kind: "cleanup"; missionId?: string }
  | { kind: "help" }
  | { kind: "unknown"; name: string };

export const SLASH_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "/new", description: "새 코딩 세션 시작" },
  { name: "/sessions", description: "세션 목록 열기" },
  { name: "/models", description: "모델/프로바이더 선택" },
  { name: "/compact", description: "대화 압축 (요약으로 접기)" },
  { name: "/undo", description: "마지막 턴 되돌리기" },
  { name: "/redo", description: "되돌린 턴 다시 적용" },
  { name: "/clear", description: "현재 세션 메시지 비우기" },
  { name: "/share", description: "대화를 마크다운으로 복사" },
  { name: "/fork", description: "role/task로 격리 mission 생성" },
  { name: "/missions", description: "Mission Board 열기" },
  { name: "/attach", description: "mission worker surface 연결/캡처" },
  { name: "/diff", description: "mission diff/review fallback 열기" },
  { name: "/verify", description: "mission 검증 실행 또는 fallback 기록" },
  { name: "/kill", description: "mission worker 중지 승인 흐름" },
  { name: "/cleanup", description: "worktree/tmux cleanup 승인 흐름" },
  { name: "/init", description: "프로젝트 분석 후 AGENTS.md 제안" },
  { name: "/plan", description: "플랜 모드 (읽기 전용 도구만)" },
  { name: "/build", description: "빌드 모드 (모든 도구)" },
  { name: "/help", description: "도움말" },
];

function parseSlashArgs(raw: string): Record<string, string> {
  const args: Record<string, string> = {};
  const pattern = /(\w+)=((?:"[^"]+")|(?:'[^']+')|\S+)/g;
  for (let match = pattern.exec(raw); match; match = pattern.exec(raw)) {
    args[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return args;
}

function parseMissionId(raw: string): string | undefined {
  const [, ...rest] = raw.trim().split(/\s+/);
  return rest.join(" ").trim() || undefined;
}

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const name = trimmed.split(/\s+/)[0]!.toLowerCase();
  const args = parseSlashArgs(trimmed);
  switch (name) {
    case "/new": return { kind: "new" };
    case "/sessions": return { kind: "sessions" };
    case "/models": return { kind: "models" };
    case "/compact": return { kind: "compact" };
    case "/undo": return { kind: "undo" };
    case "/redo": return { kind: "redo" };
    case "/clear": return { kind: "clear" };
    case "/share": return { kind: "share" };
    case "/init": return { kind: "init" };
    case "/plan": return { kind: "plan" };
    case "/build": return { kind: "build" };
    case "/fork": return { kind: "fork", role: args.role, task: args.task ?? trimmed.replace(/^\/fork\s*/i, "").trim() };
    case "/missions": return { kind: "missions" };
    case "/attach": return { kind: "attach", missionId: parseMissionId(trimmed) };
    case "/diff": return { kind: "diff", missionId: parseMissionId(trimmed) };
    case "/verify": return { kind: "verify", missionId: parseMissionId(trimmed) };
    case "/kill": return { kind: "kill", missionId: parseMissionId(trimmed) };
    case "/cleanup": return { kind: "cleanup", missionId: parseMissionId(trimmed) };
    case "/help": return { kind: "help" };
    default: return { kind: "unknown", name };
  }
}

/** @path mentions — surfaced to the system prompt so the agent reads them first */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@([\w./\\-]+)/g) ?? [];
  return [...new Set(matches.map((token) => token.slice(1)))];
}

// ─── provider payload assembly ──────────────────────────────────────────────

export function buildSystemPrompt(input: {
  agentMode: AgentMode;
  mentions?: ReadonlyArray<string>;
  workingDir?: string;
  /** P0-3: 관련 파일 자동 선택 결과(repo-map) — 있으면 시스템 프롬프트에 주입 */
  repoMap?: string;
}): string {
  const lines = [
    "당신은 이 데스크톱 오케스트레이터에 내장된 코딩 에이전트입니다. 한국어로 간결하게 답하세요.",
    "도구가 필요하면 reply 안에 아래 형식의 fenced block을 포함하세요 (여러 개 가능, 결과를 받은 뒤 계속됩니다):",
    '```tool\n{"tool":"bash","command":"<쉘 명령>"}\n```',
    '사용 가능한 도구: {"tool":"bash","command"} · {"tool":"read","path"} · {"tool":"grep","pattern","path"?} · {"tool":"glob","pattern"} · {"tool":"write","path","content"} · {"tool":"edit","path","search","replace"} · {"tool":"todo","items":["..."]}.',
    "파일 부분 수정은 write(전체 덮어쓰기) 대신 edit를 쓰세요: search에 바꿀 원문을 그대로(주변 몇 줄 포함해 고유하게), replace에 새 내용을 넣습니다. 여러 곳은 {\"tool\":\"edit\",\"path\":\"...\",\"edits\":[{\"search\":\"...\",\"replace\":\"...\"}, ...]}. search를 빈 문자열로 두면 파일 끝에 추가합니다. 새 파일은 write를 쓰세요.",
    "모든 명령은 승인 게이트를 통과하며 출력이 다음 메시지로 전달됩니다. 도구 호출이 더 필요 없으면 일반 텍스트로만 마무리하세요.",
  ];
  if (input.agentMode === "plan") {
    lines.push(
      "지금은 PLAN 모드입니다: bash/write/edit 같은 변경 도구는 실행되지 않습니다. read/grep/glob으로 조사하고, 변경은 계획으로만 제시하세요.",
    );
  }
  if (input.workingDir) {
    lines.push(`작업 디렉터리: ${input.workingDir}`);
  }
  if (input.mentions && input.mentions.length > 0) {
    lines.push(`사용자가 멘션한 파일(@): ${input.mentions.join(", ")} — 먼저 read 도구로 확인하세요.`);
  }
  if (input.repoMap && input.repoMap.trim()) {
    lines.push(
      `${input.repoMap}\n위 맵은 지금까지 본 파일들의 시그니처 요약입니다(전체 코드 아님). 필요한 파일은 read로 전체를 확인하세요.`,
    );
  }
  return lines.join("\n");
}

/** flatten session messages into the provider wire format (with tool results inline) */
export function toProviderMessages(session: CodingSession): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  if (session.compactedSummary) {
    messages.push({ role: "system", content: `이전 대화 요약:\n${session.compactedSummary}` });
  }
  for (const message of session.messages) {
    const content = message.parts
      .map((part) => {
        if (part.type === "text") return part.text;
        const call = part.call;
        const result =
          call.status === "completed"
            ? `\n[tool_result ${call.tool}]\n${call.output ?? ""}`
            : call.status === "failed"
              ? `\n[tool_result ${call.tool} FAILED]\n${call.error ?? call.output ?? ""}`
              : call.status === "denied"
                ? `\n[tool_result ${call.tool} DENIED] 사용자가 실행을 거부했습니다`
                : "";
        return `[tool ${call.tool}] ${call.title}${result}`;
      })
      .join("\n");
    messages.push({ role: message.role, content });
  }
  return messages;
}

/** /share — render the session as a markdown transcript */
export function sessionToMarkdown(session: CodingSession): string {
  const lines: string[] = [`# ${session.title}`, ""];
  for (const message of session.messages) {
    lines.push(`## ${message.role === "user" ? "사용자" : "어시스턴트"}`);
    for (const part of message.parts) {
      if (part.type === "text") {
        lines.push(part.text, "");
      } else {
        lines.push(`> 도구 ${part.call.tool}: ${part.call.title} — ${part.call.status}`);
        if (part.call.output) {
          lines.push("```", part.call.output.slice(0, 2000), "```", "");
        }
      }
    }
  }
  return lines.join("\n");
}
