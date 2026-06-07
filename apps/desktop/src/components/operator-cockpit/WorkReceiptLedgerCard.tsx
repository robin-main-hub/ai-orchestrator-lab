import { ChevronDown, ExternalLink, FileText, Search, ShieldCheck, ShieldX } from "lucide-react";
import { createPublicWorkReceiptSummary, maskPublicWorkTraceForRender } from "../../lib/publicWorkTrace";
import { sanitizePublicText } from "../../lib/publicRedaction";
import type { WorkTraceSearchItem } from "../../lib/workTraceSearch";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";

export function WorkReceiptLedgerCard({ items }: { items: WorkTraceSearchItem[] }) {
  const recentItems = items.slice(0, 8);
  const unsafeCount = items.filter((item) => !item.searchable).length;
  const searchableCount = items.length - unsafeCount;
  const sourceSummary = createReceiptSourceSummary(items);

  return (
    <GlassPanel>
      <GlassPanelHeader
        action={
          <Badge color={unsafeCount > 0 ? "yellow" : "green"}>
            {unsafeCount > 0 ? `${unsafeCount}건 점검` : "검색 가능"}
          </Badge>
        }
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-cyan-300" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">작업 영수증</h2>
            <p className="text-xs text-zinc-500">
              최근 {recentItems.length}건 · 공개 요약 기록
            </p>
          </div>
        </div>
      </GlassPanelHeader>

      <div className="grid gap-2 border-b border-zinc-800/60 px-4 py-3 text-[11px] sm:grid-cols-3">
        <ReceiptSummaryPill label="총" value={`${items.length}건`} />
        <ReceiptSummaryPill label="검색" tone="safe" value={`${searchableCount}건`} />
        <ReceiptSummaryPill label="점검" tone={unsafeCount > 0 ? "warn" : "safe"} value={`${unsafeCount}건`} />
        <div className="min-w-0 rounded-md border border-zinc-800/70 bg-black/15 px-3 py-2 text-zinc-500 sm:col-span-3">
          <span className="font-medium text-zinc-300">출처</span>{" "}
          {sourceSummary.length > 0 ? sourceSummary.join(" · ") : "아직 없음"}
        </div>
      </div>

      <div className="divide-y divide-zinc-800/60">
        {recentItems.length > 0 ? (
          recentItems.map((item) => {
            const renderTrace = maskPublicWorkTraceForRender(item.trace);
            const safeTitle = sanitizePublicText(item.title);
            const receiptSummary = createPublicWorkReceiptSummary(renderTrace);
            const detailItems =
              receiptSummary?.detailItems ??
              renderTrace.receipt?.items.map((detail) => ({
                label: detail.label,
                value: detail.value,
              })) ??
              [];
            const statusLabel =
              receiptSummary?.statusLabel ?? receiptStatusLabel(renderTrace.receipt?.status ?? item.receiptStatus);
            return (
              <article className="px-4 py-3" key={`${item.kind}:${item.id}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={kindColor(item.kind)} size="xs">
                        {kindLabel(item.kind)}
                      </Badge>
                      {statusLabel ? (
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-zinc-200">{safeTitle}</p>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">
                      공개 요약 ·{" "}
                      {receiptSummary?.detailItems.find((detail) => detail.label === "마스킹")?.value ??
                        item.safetyLabel}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${
                      item.searchable
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/20 bg-amber-500/10 text-amber-300"
                    }`}
                    title={item.safetyLabel}
                  >
                    {item.searchable ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
                    {item.safetyLabel}
                  </span>
                </div>
                {detailItems.length > 0 ? (
                  <details className="group mt-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-200">
                      상세 보기
                      <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2 grid gap-1.5 rounded-md border border-zinc-800/70 bg-black/15 p-2 sm:grid-cols-2">
                      <div className="text-[11px] font-medium text-zinc-300 sm:col-span-2">
                        {receiptSummary?.compactLabel ?? renderTrace.receipt?.label ?? safeTitle}
                      </div>
                      {detailItems.map((detail) => (
                        <div className="min-w-0" key={`${detail.label}:${detail.value}`}>
                          <div className="text-[10px] font-semibold text-zinc-600">{detail.label}</div>
                          <div className="truncate text-[11px] text-zinc-400">{detail.value}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="flex items-center gap-2 px-4 py-4 text-xs text-zinc-500">
            <Search className="h-4 w-4" />
            아직 표시할 공개 영수증이 없습니다.
          </div>
        )}
      </div>
      <div className="border-t border-zinc-800/60 px-4 py-3">
        <a
          className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-200 transition-colors hover:text-cyan-100"
          href="https://github.com/robin-main-hub/ai-orchestrator-lab/issues/251"
          rel="noreferrer"
          target="_blank"
        >
          GitHub #251 운영 장부
          <ExternalLink className="h-3 w-3" />
        </a>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          PR, 테스트, 에이전트 보고, 보정 기록은 공개 영수증과 함께 이 장부에 남깁니다.
        </p>
      </div>
    </GlassPanel>
  );
}

function ReceiptSummaryPill({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "safe" | "warn";
  value: string;
}) {
  const toneClass =
    tone === "safe"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
        : "border-zinc-800/70 bg-black/15 text-zinc-300";
  return (
    <div aria-label={`${label} ${value}`} className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <span className="text-zinc-500">{label}</span> <strong className="font-semibold">{value}</strong>
    </div>
  );
}

function createReceiptSourceSummary(items: WorkTraceSearchItem[]) {
  const order: WorkTraceSearchItem["kind"][] = ["conversation", "debate", "tmux", "approval", "memory"];
  return order
    .map((kind) => {
      const count = items.filter((item) => item.kind === kind).length;
      return count > 0 ? `${kindLabel(kind)} ${count}` : null;
    })
    .filter((item): item is string => Boolean(item));
}

function kindLabel(kind: WorkTraceSearchItem["kind"]) {
  if (kind === "conversation") return "대화";
  if (kind === "debate") return "토론";
  if (kind === "tmux") return "터미널";
  if (kind === "approval") return "승인";
  return "기억";
}

function kindColor(kind: WorkTraceSearchItem["kind"]) {
  if (kind === "conversation") return "blue";
  if (kind === "debate") return "purple";
  if (kind === "tmux") return "yellow";
  if (kind === "approval") return "red";
  return "green";
}

function receiptStatusLabel(status?: string) {
  if (status === "checkpointed") return "저장됨";
  if (status === "live") return "진행 중";
  if (status === "fallback") return "대체 경로";
  if (status === "blocked") return "차단";
  return status ? "상태 확인" : undefined;
}
