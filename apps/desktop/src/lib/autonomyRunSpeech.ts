/**
 * 자율 실행 결과 → 캐릭터 발화 텍스트 (P2-9, KIMI 브리프 / 서브컬처 축).
 *
 * 결과 상태에 맞는 감정 태그(<chuckle>/<sigh> 등)를 앞에 붙여, ttsVoice의 라우팅이
 * 감정 엔진(Orpheus 가용 시)을 고르거나 OpenAI prosody로 변환하게 한다. 순수 함수.
 */

import type { PersonaTaskOutcome } from "./personaTaskRunner";
import { loopStatusLabel } from "./autonomyRunForm";

export type RunSpeechInput = {
  personaName?: string;
  outcome?: PersonaTaskOutcome | null;
  running?: boolean;
};

/** 결과 상태별 감정 태그(앞머리) — Orpheus/OpenAI에서 톤으로 반영됨 */
function emotionLeadFor(outcome?: PersonaTaskOutcome | null, running?: boolean): string {
  if (running) return "";
  if (!outcome) return "";
  if (!outcome.ok) return "<sigh> ";
  switch (outcome.loopStatus) {
    case "completed":
      return "<chuckle> ";
    case "failed":
      return "<sigh> ";
    default:
      return "";
  }
}

/**
 * 발화 텍스트를 만든다. 결과가 없으면 null(말할 게 없음).
 * 예) "<chuckle> architect입니다. 작업을 완료했어요. code pane에서 처리했습니다."
 */
export function buildRunSpeechText(input: RunSpeechInput): string | null {
  const { outcome, running, personaName } = input;
  if (running) return null;
  if (!outcome) return null;

  const who = personaName?.trim() ? `${personaName.trim()}입니다. ` : "";
  const lead = emotionLeadFor(outcome, running);

  if (!outcome.ok) {
    const reason =
      outcome.reason === "no_free_pane" ? "비어 있는 pane이 없었습니다" : "이미 소환된 페르소나였습니다";
    return `${lead}${who}작업을 시작하지 못했어요. ${reason}.`;
  }

  const label = loopStatusLabel(outcome.loopStatus);
  const where = `${outcome.session.role} pane에서 처리했습니다`;
  if (outcome.loopStatus === "completed") {
    return `${lead}${who}작업을 완료했어요. ${where}.`;
  }
  if (outcome.loopStatus === "awaiting_human") {
    return `${lead}${who}사람 승인을 기다리고 있어요. ${where}.`;
  }
  if (outcome.loopStatus === "failed") {
    return `${lead}${who}작업이 실패했어요. ${where}.`;
  }
  return `${lead}${who}현재 상태는 ${label}입니다. ${where}.`;
}
