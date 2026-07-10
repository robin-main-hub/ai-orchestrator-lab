import { Package, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { StatusBadge } from "./StatusBadge";

/**
 * LINE F / N — Runtime manifest preview card.
 *
 * Read-only, presentational. Shows which skill entries would be
 * loadable vs blocked in a runtime manifest, with the blocking reason.
 * A blocked entry NEVER renders an enable button — this is a preview
 * of what the runtime would do, not a control to override it.
 *
 * LINE N: each entry's loadable/blocked pill now uses the shared StatusBadge
 * (loadable → PASS-style, blocked → BLOCKED-style) so manifest rows share the
 * exact iconography + variants as the other cards. The header keeps explicit
 * loadable/blocked counts for the command-center density.
 */

export type ManifestBlockReason =
  | "eval_failed"
  | "not_active"
  | "quarantined"
  | "no_eval_basis";

export type ManifestEntry = {
  id: string;
  /** Skill name / identifier. */
  name: string;
  /** True → would load; false → blocked (reason required). */
  loadable: boolean;
  /** Required when loadable === false. */
  reason?: ManifestBlockReason;
  /** Loadable but eval emitted warnings — surfaced as a badge. */
  evalWarned?: boolean;
};

const REASON_LABEL: Record<ManifestBlockReason, string> = {
  eval_failed: "eval failed",
  not_active: "not active",
  quarantined: "quarantined",
  no_eval_basis: "no eval basis",
};

export function RuntimeManifestPreviewCard({
  entries,
  title = "Runtime Manifest Preview",
}: {
  entries: ReadonlyArray<ManifestEntry>;
  title?: string;
}) {
  const loadableCount = entries.filter((e) => e.loadable).length;
  const blockedCount = entries.length - loadableCount;
  return (
    <Card
      className="gap-1.5 border-white/10 bg-white/[0.02] py-2.5"
      data-testid="runtime-manifest-card"
      data-count={entries.length}
      data-loadable={loadableCount}
      data-blocked={blockedCount}
    >
      <CardHeader className="px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-amber-300/80" />
          <span className="text-sm font-semibold">{title}</span>
          <Badge variant="default" data-testid="runtime-manifest-loadable-total">
            {loadableCount} loadable
          </Badge>
          <Badge variant="destructive" data-testid="runtime-manifest-blocked-total">
            {blockedCount} blocked
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="runtime-manifest-empty">
            no manifest entries
          </p>
        ) : (
          <ul className="space-y-1" data-testid="runtime-manifest-list">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-1.5 rounded border border-white/5 bg-background/40 px-2 py-1 text-xs"
                data-testid={`runtime-manifest-entry-${entry.id}`}
                data-loadable={entry.loadable ? "true" : "false"}
                data-reason={entry.loadable ? "" : (entry.reason ?? "")}
              >
                <StatusBadge
                  kind={entry.loadable ? "pass" : "blocked"}
                  label={entry.loadable ? "loadable" : "blocked"}
                  data-testid={`runtime-manifest-state-${entry.id}`}
                  data-loadable={entry.loadable ? "true" : "false"}
                />
                <code className="rounded bg-background/70 px-1">{entry.name}</code>
                {!entry.loadable && entry.reason ? (
                  <span
                    className="text-[12px] text-rose-300/80"
                    data-testid={`runtime-manifest-reason-${entry.id}`}
                    data-reason={entry.reason}
                  >
                    {REASON_LABEL[entry.reason]}
                  </span>
                ) : null}
                {entry.loadable && entry.evalWarned ? (
                  <Badge
                    variant="outline"
                    data-testid={`runtime-manifest-evalwarned-${entry.id}`}
                    data-eval-warned="true"
                  >
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    eval warned
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
