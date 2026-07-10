import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { PluginSourceHealth } from "../../lib/plugins/pluginManifest";
import type {
  PatchCandidateSource,
  PatchFilePreview,
  PatchSafetyStatus,
  PatchVerificationStatus,
} from "../../lib/plugins/patchCandidateSource";

/**
 * Batch 15 LINE E (+ Batch 17 LINE B/C) — read-only detail for a clicked inbox
 * row. A typed, primitive-only view of a source row, an evidence candidate, or a
 * patch candidate. There is NO free-form metadata bag — "raw metadata" is exactly
 * these whitelisted generic fields, never a spread of an arbitrary object.
 */
export type SourceDetailItem =
  | {
      kind: "source";
      pluginId: string;
      sourceRef: string;
      title: string;
      category: string;
      status: string;
      observed: boolean;
      health: PluginSourceHealth;
      generatedAt?: string;
    }
  | {
      kind: "evidence";
      pluginId: string;
      sourceRef: string;
      title: string;
      status: "suggested";
      observed: false;
      trust: string;
    }
  | {
      kind: "patch";
      candidateId: string;
      runnerId: string;
      missionId: string;
      title: string;
      changedFileCount: number;
      additions: number;
      deletions: number;
      safetyStatus: PatchSafetyStatus;
      verificationStatus: PatchVerificationStatus;
      source: PatchCandidateSource;
      observed: boolean;
      safetyBlockers: ReadonlyArray<string>;
      safetyWarnings: ReadonlyArray<string>;
      secretFindingCount: number;
      pathPolicyStatus?: PatchSafetyStatus;
      claimedTests?: { ran: boolean; passed: number; failed: number };
      actualTests?: { status: PatchVerificationStatus; summary?: string };
      evidenceRefs: ReadonlyArray<string>;
      files: ReadonlyArray<PatchFilePreview>;
    };

type DetailField = [string, string];
type DetailSection = { id: string; label: string; fields: DetailField[] };

/**
 * Batch 16 LINE D — group the (typed, primitive-only) fields into operator-room
 * sections. Every field keeps its `source-detail-field-{k}` testid; empty
 * sections are dropped. No free-form metadata bag exists on the contract, so the
 * Metadata section holds only known generic leftovers (currently none).
 */
function sectionsFor(item: SourceDetailItem): DetailSection[] {
  if (item.kind === "patch") {
    const safety: DetailField[] = [["safetyStatus", item.safetyStatus]];
    if (item.safetyBlockers.length > 0) safety.push(["blockers", item.safetyBlockers.join(", ")]);
    if (item.safetyWarnings.length > 0) safety.push(["warnings", item.safetyWarnings.join(", ")]);
    safety.push(["secretFindings", String(item.secretFindingCount)]);
    if (item.pathPolicyStatus) safety.push(["pathPolicy", item.pathPolicyStatus]);
    const verification: DetailField[] = [["verificationStatus", item.verificationStatus]];
    if (item.claimedTests) {
      verification.push([
        "claimedTests",
        `${item.claimedTests.ran ? "ran" : "not_run"} · ${item.claimedTests.passed} passed / ${item.claimedTests.failed} failed`,
      ]);
    }
    if (item.actualTests) {
      verification.push([
        "actualTests",
        item.actualTests.summary
          ? `${item.actualTests.status} · ${item.actualTests.summary}`
          : item.actualTests.status,
      ]);
    }
    const sections: DetailSection[] = [
      {
        id: "identity",
        label: "Identity",
        fields: [
          ["candidateId", item.candidateId],
          ["runnerId", item.runnerId],
          ["missionId", item.missionId],
        ],
      },
      {
        id: "stats",
        label: "Stats",
        fields: [
          ["changedFileCount", String(item.changedFileCount)],
          ["additions", String(item.additions)],
          ["deletions", String(item.deletions)],
          ["source", item.source],
          ["observed", String(item.observed)],
        ],
      },
      { id: "safety", label: "Safety", fields: safety },
      { id: "verification", label: "Verification", fields: verification },
      ...(item.evidenceRefs.length > 0
        ? [
            {
              id: "evidence",
              label: "Evidence",
              fields: [["evidenceRefs", item.evidenceRefs.join(", ")]] as DetailField[],
            },
          ]
        : []),
    ];
    return sections.filter((s) => s.fields.length > 0);
  }
  const identity: DetailField[] = [
    ["pluginId", item.pluginId],
    ["sourceRef", item.sourceRef],
  ];
  if (item.kind === "source") {
    const sections: DetailSection[] = [
      { id: "identity", label: "Identity", fields: identity },
      {
        id: "health",
        label: "Health",
        fields: [
          ["health", item.health],
          ["status", item.status],
        ],
      },
      {
        id: "source",
        label: "Source",
        fields: [
          ["category", item.category],
          ...(item.generatedAt ? ([["generatedAt", item.generatedAt]] as DetailField[]) : []),
        ],
      },
      { id: "observed", label: "Observed", fields: [["observed", String(item.observed)]] },
      { id: "metadata", label: "Metadata", fields: [] },
    ];
    return sections.filter((s) => s.fields.length > 0);
  }
  const sections: DetailSection[] = [
    { id: "identity", label: "Identity", fields: identity },
    {
      id: "evidence",
      label: "Evidence · Trust",
      fields: [
        ["status", item.status],
        ["trust", item.trust],
      ],
    },
    { id: "observed", label: "Observed", fields: [["observed", String(item.observed)]] },
  ];
  return sections.filter((s) => s.fields.length > 0);
}

/**
 * View-only side drawer. Renders null when nothing is selected (so it adds ZERO
 * DOM — and zero <button> — at mount, preserving the inbox's button-free scans).
 * The close affordance is a role="button" div (NOT a <button>), plus Esc; focus
 * is moved into the drawer on open and restored to the trigger on close.
 *
 * `onClose` MUST be stable (memoized) — the open/focus effect keys on it.
 */
export function SourceDetailDrawer({
  item,
  onClose,
}: {
  item: SourceDetailItem | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!item) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="source detail"
      tabIndex={-1}
      data-testid="source-detail-drawer"
      data-kind={item.kind}
      className="fixed right-3 top-16 z-50 w-72 rounded-lg border border-white/15 bg-zinc-950/95 p-3 shadow-xl outline-none backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          {item.kind === "source" ? "Source detail" : "Source evidence detail"} · read-only
        </span>
        <div
          role="button"
          tabIndex={0}
          aria-label="닫기"
          data-action-scope="local-detail"
          data-testid="source-detail-close"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClose();
            }
          }}
          className="flex cursor-pointer items-center rounded px-1 text-muted-foreground hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </div>
      </div>
      <p
        className="mb-2 break-words text-[12px] font-medium text-zinc-200"
        data-testid="source-detail-title"
      >
        {item.title}
      </p>
      <div className="space-y-2">
        {sectionsFor(item).map((section) => (
          <section key={section.id} data-testid={`source-detail-section-${section.id}`}>
            <p className="mb-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/45">
              {section.label}
            </p>
            <dl className="space-y-0.5">
              {section.fields.map(([k, v]) => (
                <div
                  key={k}
                  data-testid={`source-detail-field-${k}`}
                  data-field={k}
                  className="flex items-start justify-between gap-2 text-[12px]"
                >
                  <dt className="shrink-0 uppercase tracking-wide text-muted-foreground/60">{k}</dt>
                  <dd className="min-w-0 break-all text-right text-zinc-300">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {item.kind === "patch" && item.files.length > 0 ? (
        <div className="mt-2" data-testid="patch-diff-preview">
          <p className="mb-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/45">
            Diff Preview · diff preview only
          </p>
          <ul className="space-y-1">
            {item.files.map((f, i) => (
              <li
                key={`${f.path}-${i}`}
                data-testid={`patch-diff-file-${i}`}
                data-change={f.change}
                className="rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-1 text-[12px]"
              >
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{f.path}</span>
                  <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground/70">
                    {f.change}
                  </span>
                  {f.risk ? (
                    <span
                      className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground"
                      data-testid={`patch-diff-risk-${i}`}
                      data-risk={f.risk}
                    >
                      {f.risk}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground/60">
                  <span className="tabular-nums text-emerald-300/70">+{f.additions}</span>
                  <span className="tabular-nums text-rose-300/70">-{f.deletions}</span>
                  {f.hunkSummary ? <span className="min-w-0 truncate">{f.hunkSummary}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-[12px] text-muted-foreground/45">view-only · no action</p>
    </aside>
  );
}
