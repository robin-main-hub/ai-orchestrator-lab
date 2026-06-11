import type { AgentRole } from "@ai-orchestrator/protocol";
import type { AgentActivityStatus } from "../types";
import { sanitizePublicText } from "./publicRedaction";

/**
 * 추천대화 — 에이전트의 "방금 답변"을 근거로 다음 메시지 3개를 제안한다.
 *
 * 사용자 의도(명시 지시):
 *  1. 세 개 전부 마지막 어시스턴트 답변에서 파생될 것 — 일반 문구 금지.
 *  2. 에이전트가 아직 답하지 않았거나 생각 중이면 아무것도 띄우지 말 것.
 *
 * 구조: 답변을 신호로 분해(오류/제안 행동/단정/질문/주제)한 뒤 세 슬롯을 채운다.
 *   ① 파고들기 — 답변의 핵심 문장을 인용해 원인/세부를 더 묻는다
 *   ② 실행 — 답변이 제안한 다음 조치를 그대로 실행 지시로 바꾼다
 *   ③ 검증 — 답변의 단정을 검증하거나, 답변이 남긴 질문에 답을 요구한다
 * LLM 호출 없이 순수 분석으로 동작해 공급자가 죽어 있어도(바로 그 순간이
 * 추천이 가장 필요한 때다) 항상 답변 기반 제안이 나온다.
 */

export type AgentConversationPromptSuggestionsInput = {
  activity: AgentActivityStatus;
  displayName: string;
  lastAssistantMessageContent?: string;
  memoryRecordCount: number;
  messageCount: number;
  pendingApprovalCount: number;
  role: AgentRole;
};

const BUSY_ACTIVITIES: ReadonlySet<AgentActivityStatus> = new Set<AgentActivityStatus>([
  "preparing",
  "tooling",
  "capturing",
  "dispatching",
  "testing",
  "responding",
]);

export function createAgentConversationPromptSuggestions({
  activity,
  displayName,
  lastAssistantMessageContent,
}: AgentConversationPromptSuggestionsInput): string[] {
  const name = sanitizePublicText(displayName.trim() || "이 동료");
  const answer = sanitizePublicText(lastAssistantMessageContent?.trim() ?? "");
  // 답변이 없거나(첫 화면) 아직 생각/응답 중이면 추천을 띄우지 않는다.
  if (!answer || BUSY_ACTIVITIES.has(activity)) {
    return [];
  }

  const signals = extractAnswerSignals(answer);
  // 에이전트가 사용자에게 확인 질문을 던진 턴 → 추천은 그 질문에 대한
  // "보낼 수 있는 답변" 3개가 된다 (질문에 질문으로 답하지 않는다).
  const suggestions =
    signals.openQuestions.length > 0
      ? answerCandidatePrompts(name, signals)
      : [
          digDeeperPrompt(name, signals),
          executeProposalPrompt(name, signals),
          verifyOrAnswerPrompt(name, signals),
        ];

  const unique: string[] = [];
  for (const suggestion of suggestions) {
    const clean = sanitizePublicText(suggestion);
    if (clean && !unique.includes(clean)) {
      unique.push(clean);
    }
  }
  return unique.slice(0, 3);
}

// ─── 답변 후보 모드: 에이전트의 확인 질문에 바로 보낼 답 3개 ────────────────

function answerCandidatePrompts(name: string, signals: AnswerSignals): string[] {
  const [first, second] = signals.openQuestions;
  const candidates: string[] = [];
  if (first) {
    candidates.push(`"${first}" — 응, 그렇게 진행해줘.`);
  }
  if (second) {
    candidates.push(`"${second}" — 네가 더 합리적이라고 보는 쪽으로 정해줘.`);
  } else if (first) {
    candidates.push(`"${first}" — 아니, 다른 대안을 장단점과 함께 2개만 제시해줘.`);
  }
  candidates.push(`${name}, 확인 질문은 전부 네 판단대로 기본값으로 정하고 — 결정 요약만 보여준 뒤 바로 시작해줘.`);
  return candidates;
}

// ─── 답변 신호 분해 ─────────────────────────────────────────────────────────

export type AnswerSignals = {
  /** 답변의 첫 핵심 문장 (인용용, 60자 클램프) */
  headline: string;
  /** 오류/막힘을 보고하는 답변인가 */
  isError: boolean;
  /** 답변이 제안한 다음 조치 문장 (있다면) */
  proposedAction?: string;
  /** 답변이 사용자에게 되물은 질문 (있다면, 마지막 것) */
  openQuestion?: string;
  /** 답변 안의 확인 질문 전부 (표 셀 안 질문 포함, 순서 유지, 최대 4개) */
  openQuestions: string[];
  /** 감지된 주제 */
  topic: "approval" | "test" | "memory" | "network" | "design" | "general";
};

/** 답변이 행동을 제안하는 문형: 명시 라벨 + "~(하/되/붙이/연결하)면 …" 조건 제안형 */
const ACTION_CUE_RE =
  /(다음 조치|재시도|다시 (호출|시도)|추천\s*:|제안\s*:|방법\s*:)|[가-힣A-Za-z]+(하|되|이)면\s*(더 |좋|안전|할 수|돼|됩니)/;
const ERROR_CUES = ["실패", "막혔", "오류", "에러", "failed", "error", "unreachable", "차단", "거부"];

function clamp(text: string, limit = 60): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > limit ? `${single.slice(0, limit)}…` : single;
}

export function extractAnswerSignals(answer: string): AnswerSignals {
  const sentences = answer
    .split(/(?<=[.!?다요])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 4);
  const headline = clamp(sentences[0] ?? answer);
  const lower = answer.toLowerCase();

  const isError = ERROR_CUES.some((cue) => lower.includes(cue));
  const proposedAction = sentences.find((sentence) => ACTION_CUE_RE.test(sentence));
  // 확인 질문 수집 — 문장 끝 ? 뿐 아니라 표 셀("| 항목 | …할까요? |")이나
  // 한국어 의문형 어미("~할까/까요/나요/는지")로 끝나는 줄도 질문으로 본다.
  const openQuestions = sentences
    .filter(
      (sentence) =>
        /[?？]/.test(sentence) || /(할까|까요|나요|ㄹ까요|는지요?|건가요|인가요)\s*$/.test(sentence),
    )
    .map((sentence) => clamp(stripTableDecorations(sentence), 70))
    .filter((sentence, index, all) => sentence.length > 4 && all.indexOf(sentence) === index)
    .slice(0, 4);
  const openQuestion = openQuestions.at(-1);

  const topic: AnswerSignals["topic"] =
    isError && (lower.includes("네트워크") || lower.includes("fetch") || lower.includes("호출") || lower.includes("연결"))
      ? "network"
      : answer.includes("승인") || answer.includes("권한")
        ? "approval"
        : answer.includes("테스트") || answer.includes("검증")
          ? "test"
          : answer.includes("기억") || answer.includes("맥락")
            ? "memory"
            : answer.includes("설계") || answer.includes("구조")
              ? "design"
              : "general";

  return {
    headline,
    isError,
    proposedAction: proposedAction ? clamp(proposedAction, 70) : undefined,
    openQuestion,
    openQuestions,
    topic,
  };
}

/** 마크다운 표/볼드 장식 제거 — "| **플랫폼** | 웹으로 만들까요? |" → "플랫폼 웹으로 만들까요?" */
function stripTableDecorations(sentence: string): string {
  return sentence
    .replace(/\|/g, " ")
    .replace(/\*\*/g, "")
    .replace(/^[-:\s]+|[-:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── 슬롯 ①: 답변의 핵심을 파고들기 ────────────────────────────────────────

function digDeeperPrompt(name: string, signals: AnswerSignals): string {
  if (signals.isError) {
    return `${name}, 방금 "${signals.headline}" 라고 했는데 — 원인을 단계별로 좁혀서 어디서 끊기는지 진단해줘.`;
  }
  switch (signals.topic) {
    case "approval":
      return `${name}, 방금 답변에서 말한 승인 항목별로 승인/보류 근거를 한 줄씩 붙여줘.`;
    case "test":
      return `${name}, 방금 말한 검증을 내가 그대로 실행할 명령 순서로 바꿔줘.`;
    case "memory":
      return `${name}, 방금 답변에서 장기 기억으로 남길 문장만 골라서 보여줘.`;
    case "design":
      return `${name}, 방금 설명한 구조에서 가장 위험한 결합 지점을 짚어줘.`;
    default:
      return `${name}, 방금 "${signals.headline}" 부분을 구체 예시와 함께 더 풀어줘.`;
  }
}

// ─── 슬롯 ②: 답변이 제안한 행동을 실행으로 ─────────────────────────────────

function executeProposalPrompt(name: string, signals: AnswerSignals): string {
  if (signals.proposedAction) {
    return `${name}, 방금 제안한 "${signals.proposedAction}" — 그대로 진행해줘.`;
  }
  if (signals.isError) {
    return `${name}, 방금 막힌 호출을 다른 경로(직접 공급자/로컬)로 한 번 더 시도해줘.`;
  }
  return `${name}, 방금 답변을 실행 단계 3개로 쪼개서 첫 단계부터 시작해줘.`;
}

// ─── 슬롯 ③: 단정 검증 또는 남긴 질문에 답하기 ─────────────────────────────

function verifyOrAnswerPrompt(name: string, signals: AnswerSignals): string {
  if (signals.openQuestion) {
    return `${name}, 네가 물어본 "${signals.openQuestion}" — 선택지를 장단점과 함께 제시해줘, 내가 고를게.`;
  }
  if (signals.isError) {
    return `${name}, "${signals.headline}" 판단의 근거 로그를 보여주고, 네트워크가 아닐 가능성도 검토해줘.`;
  }
  return `${name}, 방금 답변에서 가장 자신 없는 가정 하나를 골라 어떻게 확인할지 알려줘.`;
}
