import { FileSearch, ShieldCheck, ShieldAlert, ShieldX, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";

/**
 * LINE F — Evidence card.
 *
 * Read-only, presentational. Shows a single evidence item with its
 * verdict (pass/warning/blocked) and compact source footnotes (refs
 * stay visible but small). NEVER renders an enable/approve action for
 * a blocked item — evidence is observation, not a command surface.
 */

export type EvidenceVerdict = "pass" | "warning" | "blocked";

export type EvidenceRef = {
  /** Stable id of the reference (used for keys + testids). */
  id: string;
  /** Short human label, e.g. a file path or tool name. */
  label: string;
  /** Optional locator detail (line range, url fragment, …). */
  locator?: string;
};

export type EvidenceItem = {
  id: string;
  /** Short title / claim being evidenced. */
  title: string;
  verdict: EvidenceVerdict;
  /** Optional one-line summary. Kept compact (badge-first design). */
  summary?: string;
  /** Source footnotes. Shown compact but always visible. */
  refs?: ReadonlyArray<EvidenceRef>;
  /** Honest observation flag — false renders "not observed", no fake pass. */
  observed?: boolean;
};

const VERDICT_LABEL: Record<EvidenceVerdict, string> = {
  pass: "PASS",
  warning: "WARNING",
  blocked: "BLOCKED",
};

function verdictVariant(v: EvidenceVerdict) {
  if (v === "pass") return "default" as const;
  if (v === "warning") return "outline" as const;
  return "destructive" as const;
}

export function EvidenceCard({ item }: { item: EvidenceItem }) {
  const refs = item.refs ?? [];
  const observed = item.observed !== false;
  return (
    <Card
      className="gap-2 border-white/10 bg-white/[0.02] py-3"
      data-testid={`evidence-card-${item.id}`}
      data-verdict={item.verdict}
      data-observed={observed ? "true" : "false"}
    >
      <CardHeader className="px-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileSearch className="h-3.5 w-3.5 text-cyan-300/80" />
          <span className="text-sm font-semibold">{item.title}</span>
          <Badge
            variant={verdictVariant(item.verdict)}
            data-testid={`evidence-verdict-${item.id}`}
            data-verdict={item.verdict}
          >
            {item.verdict === "pass" ? (
              <ShieldCheck className="mr-1 inline h-3 w-3" />
            ) : item.verdict === "warning" ? (
              <ShieldAlert className="mr-1 inline h-3 w-3" />
            ) : (
              <ShieldX className="mr-1 inline h-3 w-3" />
            )}
            {VERDICT_LABEL[item.verdict]}
          </Badge>
          {!observed ? (
            <Badge
              variant="outline"
              data-testid={`evidence-observed-${item.id}`}
              data-observed="false"
            >
              not observed
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-3">
        {item.summary ? (
          <p className="text-xs text-muted-foreground" data-testid={`evidence-summary-${item.id}`}>
            {item.summary}
          </p>
        ) : null}
        <ul
          className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground"
          data-testid={`evidence-refs-${item.id}`}
          data-ref-count={refs.length}
        >
          {refs.length === 0 ? (
            <li data-testid={`evidence-refs-empty-${item.id}`}>no source refs</li>
          ) : (
            refs.map((ref) => (
              <li
                key={ref.id}
                className="inline-flex items-center gap-0.5"
                data-testid={`evidence-ref-${item.id}-${ref.id}`}
              >
                <Link2 className="h-2.5 w-2.5" />
                <code className="rounded bg-background/70 px-1">{ref.label}</code>
                {ref.locator ? <span className="opacity-70">{ref.locator}</span> : null}
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
