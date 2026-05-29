import { create } from "zustand";
import type { WorkItem, AssistantDraft, WorkItemHandoff } from "@ai-orchestrator/protocol";
import {
  initialAssistantDrafts,
  initialWorkItemHandoffs,
  initialWorkItems,
} from "../seeds/workItems";

interface WorkItemsState {
  workItems: WorkItem[];
  assistantDrafts: AssistantDraft[];
  workItemHandoffs: WorkItemHandoff[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setWorkItems: (items: WorkItem[]) => void;
  prependWorkItem: (item: WorkItem) => void;
  updateWorkItem: (id: string, patch: Partial<WorkItem>) => void;
  prependAssistantDraft: (draft: AssistantDraft) => void;
  prependWorkItemHandoff: (handoff: WorkItemHandoff) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWorkItemsStore = create<WorkItemsState>()((set) => ({
  workItems: initialWorkItems,
  assistantDrafts: initialAssistantDrafts,
  workItemHandoffs: initialWorkItemHandoffs,
  isLoading: false,
  error: null,

  setWorkItems: (items) => set({ workItems: items }),
  prependWorkItem: (item) => set((state) => {
    // 중복 추가 방지
    if (state.workItems.some(i => i.id === item.id)) {
      return {};
    }
    return { workItems: [item, ...state.workItems] };
  }),
  updateWorkItem: (id, patch) => set((state) => ({
    workItems: state.workItems.map((item) => 
      item.id === id ? { ...item, ...patch } : item
    ),
  })),
  prependAssistantDraft: (draft) => set((state) => {
    if (state.assistantDrafts.some(d => d.id === draft.id)) {
      return {};
    }
    return { assistantDrafts: [draft, ...state.assistantDrafts] };
  }),
  prependWorkItemHandoff: (handoff) => set((state) => {
    if (state.workItemHandoffs.some(h => h.id === handoff.id)) {
      return {};
    }
    return { workItemHandoffs: [handoff, ...state.workItemHandoffs] };
  }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
