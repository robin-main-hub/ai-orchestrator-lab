import {
  createPublicTraceSafetyReport,
  createPublicWorkReceiptSummary,
  type PublicWorkTrace,
} from "./publicWorkTrace";

export type WorkTraceSearchSource = {
  id: string;
  kind: "conversation" | "debate" | "tmux" | "approval" | "memory";
  title: string;
  trace: PublicWorkTrace;
};

export type WorkTraceSearchItem = WorkTraceSearchSource & {
  receiptStatus?: string;
  safetyLabel: string;
  searchable: boolean;
  searchText: string;
};

export function createWorkTraceSearchIndex(sources: WorkTraceSearchSource[]): WorkTraceSearchItem[] {
  return sources.map((source) => {
    const safety = createPublicTraceSafetyReport(source.trace);
    const receipt = createPublicWorkReceiptSummary(source.trace);
    const searchText = [
      source.id,
      source.kind,
      source.title,
      receipt?.compactLabel,
      ...source.trace.groups.flatMap((group) => [
        group.title,
        ...group.items.flatMap((item) => [item.label, item.value]),
      ]),
      ...(source.trace.receipt?.items.flatMap((item) => [item.label, item.value]) ?? []),
    ].filter(Boolean).join(" ").toLowerCase();

    return {
      ...source,
      receiptStatus: source.trace.receipt?.status,
      safetyLabel: safety.isSafe ? "검색 가능" : "검색 제외 필요",
      searchable: safety.isSafe,
      searchText,
    };
  });
}

export function searchWorkTraceIndex(index: WorkTraceSearchItem[], query: string): WorkTraceSearchItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return index.filter((item) => item.searchable);
  return index.filter((item) => item.searchable && terms.every((term) => item.searchText.includes(term)));
}
