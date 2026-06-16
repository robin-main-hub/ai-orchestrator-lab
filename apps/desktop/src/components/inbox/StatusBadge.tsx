import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Radio,
  CircleSlash,
  FlaskConical,
} from "lucide-react";
import { Badge } from "../ui/badge";

/**
 * LINE N — Assistant Inbox shared status + source badges.
 *
 * Command-center density depends on ONE consistent visual language for status
 * across all five cards. Previously every card mapped its own verdict/stage/
 * status to ad-hoc badge variants + icons. This module centralizes:
 *
 *   - `StatusBadge`  — the unified PASS / WARNING / BLOCKED status pill
 *     (consistent variant + iconography everywhere).
 *   - `SourceBadge`  — the unified LIVE / no-live-data / 예시(fixture) provenance
 *     pill (one component, not per-section inline markup).
 *
 * Both are presentational, read-only, and fire no callbacks. They are the
 * single source of truth for badge styling so the inbox reads as one surface.
 */

export type StatusKind = "pass" | "warning" | "blocked";

const STATUS_LABEL: Record<StatusKind, string> = {
  pass: "PASS",
  warning: "WARNING",
  blocked: "BLOCKED",
};

function statusVariant(kind: StatusKind) {
  if (kind === "pass") return "default" as const;
  if (kind === "warning") return "outline" as const;
  return "destructive" as const;
}

function StatusIcon({ kind }: { kind: StatusKind }) {
  if (kind === "pass") return <ShieldCheck className="mr-1 inline h-3 w-3" />;
  if (kind === "warning") return <ShieldAlert className="mr-1 inline h-3 w-3" />;
  return <ShieldX className="mr-1 inline h-3 w-3" />;
}

/**
 * Unified status pill. `label` overrides the default PASS/WARNING/BLOCKED text
 * (e.g. a learning stage) while keeping the consistent variant + iconography.
 * Extra `data-*` / aria props are forwarded so callers keep stable testids.
 */
export function StatusBadge({
  kind,
  label,
  ...rest
}: {
  kind: StatusKind;
  label?: string;
} & Record<`data-${string}`, string | number | undefined>) {
  return (
    <Badge variant={statusVariant(kind)} data-status-kind={kind} {...rest}>
      <StatusIcon kind={kind} />
      {label ?? STATUS_LABEL[kind]}
    </Badge>
  );
}

// ── source provenance badge (live / empty / example) ────────────────────────

export type InboxSourceKind = "live" | "empty" | "example";

const SOURCE_LABEL: Record<InboxSourceKind, string> = {
  live: "live",
  empty: "no live data",
  example: "예시(fixture)",
};

function sourceVariant(source: InboxSourceKind) {
  if (source === "live") return "default" as const;
  if (source === "example") return "outline" as const;
  return "secondary" as const;
}

function SourceIcon({ source }: { source: InboxSourceKind }) {
  if (source === "live") return <Radio className="mr-1 inline h-3 w-3" />;
  if (source === "example") return <FlaskConical className="mr-1 inline h-3 w-3" />;
  return <CircleSlash className="mr-1 inline h-3 w-3" />;
}

/** Unified per-section provenance pill. */
export function SourceBadge({
  id,
  source,
}: {
  id: string;
  source: InboxSourceKind;
}) {
  return (
    <Badge
      variant={sourceVariant(source)}
      data-testid={`assistant-inbox-source-${id}`}
      data-source={source}
    >
      <SourceIcon source={source} />
      {SOURCE_LABEL[source]}
    </Badge>
  );
}
