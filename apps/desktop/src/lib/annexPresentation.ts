import { sanitizePublicText } from "./publicRedaction";

export type AnnexTabKey = "status" | "evidence" | "agents" | "memory" | "queue" | "logs";

export const annexCopy = {
  kicker: "토론 보조자료",
} as const;

export const annexTabPresentation: Record<AnnexTabKey, { label: string }> = {
  agents: { label: "에이전트 흐름" },
  evidence: { label: "근거" },
  logs: { label: "로그" },
  memory: { label: "기억" },
  queue: { label: "대기열" },
  status: { label: "상태" },
};

export function formatAnnexTabLabel(label: string, count: number): string {
  const safeLabel = sanitizeDebateAnnexText(label.trim() || "보조자료");
  if (!Number.isFinite(count) || count <= 0) return safeLabel;
  return `${safeLabel} ${Math.min(Math.floor(count), 99)}`;
}

export function createAnnexTabCountSummary(counts: Record<AnnexTabKey, number>): string {
  const order: AnnexTabKey[] = ["status", "evidence", "agents", "memory", "queue", "logs"];
  const active = order
    .map((key) => [key, counts[key]] as const)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => formatAnnexTabLabel(annexTabPresentation[key].label, count));
  return active.length > 0 ? `보조자료 ${active.join(" · ")}` : "보조자료 없음";
}

export function sanitizeDebateAnnexText(value: string) {
  return sanitizePublicText(value);
}
