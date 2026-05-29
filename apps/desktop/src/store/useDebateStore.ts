import { create } from "zustand";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import type { Stage3DebateUtteranceView } from "../types";

export type RoundNodeInfo = {
  id: string;
  title: string;
  type: "agreement" | "conflict" | "risk";
  agents: string[];
  summary: string;
  keywords: string[];
  utteranceCount: number;
  lastUtteranceId?: string;
};

interface DebateState {
  sessions: Record<string, Stage3DebateSession>;
  roundNodes: Record<string, RoundNodeInfo[]>;
  setSession: (session: Stage3DebateSession) => void;
}

export const useDebateStore = create<DebateState>()((set, get) => ({
  sessions: {},
  roundNodes: {},

  setSession: (session: Stage3DebateSession) => {
    const state = get();
    const cachedNodes = state.roundNodes[session.id] ?? [];
    const nodeMap = new Map<string, RoundNodeInfo>();
    for (const node of cachedNodes) {
      nodeMap.set(node.id, node);
    }

    // Collect all utterances from all rounds in the session and map to Stage3DebateUtteranceView
    const allUtterancesView: Stage3DebateUtteranceView[] = [];
    for (const round of session.rounds) {
      for (const utterance of round.utterances) {
        allUtterancesView.push({
          ...utterance,
          roundTitle: round.title,
          agentName:
            session.participants.find((p) => p.agentId === utterance.agentId)?.name ??
            utterance.agentId,
        });
      }
    }

    const calculatedRoundNodes = session.rounds.map((round) => {
      const roundUtterances = allUtterancesView.filter((u) => u.roundTitle === round.title);
      const lastUtterance = roundUtterances[roundUtterances.length - 1];
      const lastUtteranceId = lastUtterance?.id;

      // Check if we can reuse the cached node
      const cachedSession = state.sessions[session.id];
      const cachedRound = cachedSession?.rounds.find((r) => r.id === round.id);
      const isRoundUnchanged =
        cachedRound === round ||
        (cachedRound !== undefined &&
          cachedRound.utterances.length === round.utterances.length &&
          cachedRound.utterances.every((utt, idx) => utt === round.utterances[idx]));

      const cached = nodeMap.get(round.id);
      if (
        cached &&
        isRoundUnchanged &&
        cached.utteranceCount === roundUtterances.length &&
        cached.lastUtteranceId === lastUtteranceId
      ) {
        return cached;
      }

      // Collect agent names
      const agents = Array.from(new Set(roundUtterances.map((u) => u.agentName)));

      // 1-line summary extraction
      let summary = "이 라운드에서 에이전트 간 논의가 진행 중입니다.";
      if (roundUtterances.length > 0) {
        const mainUtterance =
          roundUtterances.find((u) => u.decisionId !== undefined) ||
          roundUtterances[roundUtterances.length - 1];
        if (mainUtterance) {
          const firstLine = mainUtterance.content.split("\n")[0] || "";
          summary =
            firstLine.slice(0, 80) + (mainUtterance.content.length > 80 ? "..." : "");
        }
      }

      // Determine semantic status
      let type: "agreement" | "conflict" | "risk" = "conflict";
      const hasDecision = roundUtterances.some((u) => u.decisionId !== undefined);
      const hasRisk = roundUtterances.some((u) =>
        /보안|취약|위험|차단|오류|오동작|risk|violation|blocked/i.test(u.content)
      );

      if (hasRisk) {
        type = "risk";
      } else if (hasDecision) {
        type = "agreement";
      }

      // Keywords analysis
      const keywords: string[] = [];
      if (type === "agreement") keywords.push("합의성공", "의사결정");
      if (type === "risk") keywords.push("보안검증", "리스크감지");
      if (type === "conflict") keywords.push("대안탐색", "상호비평");

      const allText = roundUtterances.map((u) => u.content).join(" ");
      if (/oauth|token|notion/i.test(allText)) keywords.push("OAuth");
      if (/stream|completions/i.test(allText)) keywords.push("Streaming");
      if (/memory|reflect/i.test(allText)) keywords.push("Memory");
      if (/control|queue/i.test(allText)) keywords.push("Control");

      return {
        id: round.id,
        title: round.title,
        type,
        agents,
        summary,
        keywords,
        utteranceCount: roundUtterances.length,
        lastUtteranceId,
      };
    });

    const hasChanged =
      cachedNodes.length !== calculatedRoundNodes.length ||
      calculatedRoundNodes.some((node, idx) => node !== cachedNodes[idx]);

    const finalNodes = hasChanged ? calculatedRoundNodes : cachedNodes;

    if (state.sessions[session.id] === session && !hasChanged) {
      return;
    }

    set((state) => ({
      sessions: {
        ...state.sessions,
        [session.id]: session,
      },
      roundNodes: {
        ...state.roundNodes,
        [session.id]: finalNodes,
      },
    }));
  },
}));
