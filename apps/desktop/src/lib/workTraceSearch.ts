import {
  createPublicTraceSafetyReport,
  createPublicWorkReceiptSummary,
  maskPublicWorkTraceForRender,
  type PublicWorkTrace,
} from "./publicWorkTrace";
import { inspectPublicText, sanitizePublicText } from "./publicRedaction";

export type WorkTraceSearchSource = {
  createdAt?: string;
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
    const traceSafety = createPublicTraceSafetyReport(source.trace);
    const titleSafety = inspectPublicText(source.title);
    const isSafe = traceSafety.isSafe && titleSafety.isSafe;
    const renderTrace = maskPublicWorkTraceForRender(source.trace);
    const receipt = createPublicWorkReceiptSummary(renderTrace);
    const safeTitle = sanitizePublicText(source.title);
    const searchText = [
      source.id,
      source.kind,
      safeTitle,
      receipt?.compactLabel,
      ...renderTrace.groups.flatMap((group) => [
        group.title,
        ...group.items.flatMap((item) => [item.label, item.value]),
      ]),
      ...(renderTrace.receipt?.items.flatMap((item) => [item.label, item.value]) ?? []),
    ].filter(Boolean).join(" ").toLowerCase();

    return {
      ...source,
      receiptStatus: renderTrace.receipt?.status,
      safetyLabel: isSafe ? "검색 가능" : "검색 제외 필요",
      searchable: isSafe,
      title: safeTitle,
      trace: renderTrace,
      searchText,
    };
  });
}

export function searchWorkTraceIndex(index: WorkTraceSearchItem[], query: string): WorkTraceSearchItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return index.filter((item) => item.searchable);
  return index.filter((item) => item.searchable && terms.every((term) => item.searchText.includes(term)));
}
