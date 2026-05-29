import { create } from "zustand";

interface StreamingState {
  chunks: Record<string, string>;
  reasoningSnippets: Record<string, string>;
  agentSteps: Record<string, string>;
  setContent: (id: string, content: string) => void;
  setReasoningSnippet: (agentId: string, snippet: string) => void;
  setAgentStep: (agentId: string, step: string) => void;
  clearContent: (id: string) => void;
  clearReasoning: (agentId: string) => void;
}

export const useStreamingStore = create<StreamingState>()((set) => ({
  chunks: {},
  reasoningSnippets: {},
  agentSteps: {},
  setContent: (id, content) =>
    set((state) => ({
      chunks: {
        ...state.chunks,
        [id]: content,
      },
    })),
  setReasoningSnippet: (agentId, snippet) =>
    set((state) => ({
      reasoningSnippets: {
        ...state.reasoningSnippets,
        [agentId]: snippet,
      },
    })),
  setAgentStep: (agentId, step) =>
    set((state) => ({
      agentSteps: {
        ...state.agentSteps,
        [agentId]: step,
      },
    })),
  clearContent: (id) =>
    set((state) => {
      const next = { ...state.chunks };
      delete next[id];
      return { chunks: next };
    }),
  clearReasoning: (agentId) =>
    set((state) => {
      const nextReasoning = { ...state.reasoningSnippets };
      delete nextReasoning[agentId];
      const nextSteps = { ...state.agentSteps };
      delete nextSteps[agentId];
      return {
        reasoningSnippets: nextReasoning,
        agentSteps: nextSteps,
      };
    }),
}));
