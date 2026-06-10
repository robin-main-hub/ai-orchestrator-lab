import type { ConversationMessage } from "@ai-orchestrator/protocol";
import { extractMentions } from "./codingChat";
import { createMission, type WorkbenchMission } from "./workbenchMissions";

/**
 * Phase B — `/fork`: 현재 대화를 격리 worker로 포크.
 *
 * 대화 transcript와 @멘션 파일에서 worker brief(작업 제목·범위·요약)를 뽑아,
 * 그 컨텍스트를 담은 Mission을 만든다. 자동 병합 금지(Manus/Kimi 합의) — Mission은
 * blocked 상태의 안전 셸로 생성되고, 결과는 diff/verify 게이트를 거친다.
 */

export type ForkBrief = {
  /** worker 작업 제목 (최근 사용자 요청 요약) */
  task: string;
  /** @경로 멘션에서 모은 파일 범위 */
  mentions: string[];
  /** 대화 맥락 요약 (마지막 몇 턴) */
  summary: string;
};

function clampLine(value: string, max = 120): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/** 대화 메시지 + 작성 중 드래프트에서 fork brief 추출 */
export function buildForkBrief(input: {
  messages: ReadonlyArray<ConversationMessage>;
  draft?: string;
}): ForkBrief {
  const { messages, draft } = input;
  const userMessages = messages.filter((message) => message.role === "user");
  const lastUser = [...userMessages].reverse()[0]?.content ?? "";
  const task = clampLine(draft?.trim() || lastUser || "대화 컨텍스트 기반 작업", 80);

  // 멘션 — 드래프트 + 최근 메시지들에서 @경로 수집
  const mentionSources = [draft ?? "", ...messages.slice(-12).map((message) => message.content)];
  const mentions = Array.from(new Set(mentionSources.flatMap((text) => extractMentions(text)))).slice(0, 20);

  // 요약 — 마지막 6턴을 화자: 한 줄로
  const recent = messages.slice(-6).map((message) => {
    const who = message.role === "user" ? "사용자" : message.role === "assistant" ? "에이전트" : "시스템";
    return `${who}: ${clampLine(message.content, 90)}`;
  });
  const summary = recent.join("\n") || "최근 대화 없음";

  return { task, mentions, summary };
}

/** glob 범위로 변환 — 멘션된 파일이 있으면 그 디렉터리, 없으면 기본 범위 */
export function forkScopeFromMentions(mentions: ReadonlyArray<string>): string[] {
  if (mentions.length === 0) return ["apps/desktop/src/**", "docs/**"];
  const scopes = new Set<string>();
  for (const mention of mentions) {
    const dir = mention.includes("/") ? `${mention.slice(0, mention.lastIndexOf("/"))}/**` : mention;
    scopes.add(dir);
  }
  return Array.from(scopes).slice(0, 12);
}

/** fork brief → Mission (대화 출처를 events/origin에 기록) */
export function forkMissionFromConversation(input: {
  brief: ForkBrief;
  role?: string;
  model?: string;
  sessionTitle?: string;
}): WorkbenchMission {
  const { brief } = input;
  const mission = createMission({
    role: input.role ?? "Implementer",
    task: brief.task,
    model: input.model,
    allowedPaths: forkScopeFromMentions(brief.mentions),
    origin: input.sessionTitle ? `대화 포크 · ${input.sessionTitle}` : "대화 포크",
    originEvent: `대화를 worker로 포크. 멘션 ${brief.mentions.length}건, 컨텍스트 요약 포함.`,
  });
  // 대화 맥락을 첫 이벤트들로 남겨 worker가 콜드 스타트에서도 맥락을 갖게 한다
  const now = mission.heartbeat;
  mission.events = [
    ...mission.events,
    ...(brief.mentions.length > 0
      ? [{ id: `ev_m_${Date.now()}`, at: now, text: `멘션 범위: ${brief.mentions.join(", ")}` }]
      : []),
    { id: `ev_s_${Date.now()}`, at: now, text: `컨텍스트:\n${brief.summary}` },
  ];
  mission.lastOutput = `포크 준비됨 — "${brief.task}". worktree/tmux 러너는 아직 미연결(안전 fallback).`;
  return mission;
}
