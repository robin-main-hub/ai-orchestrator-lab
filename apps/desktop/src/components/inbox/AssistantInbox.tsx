import { Inbox } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { EvidenceCard, type EvidenceItem } from "./EvidenceCard";
import { LearningLoopCard, type LearningLoopItem } from "./LearningLoopCard";
import { MemoryCandidateCard, type MemoryCandidateItem } from "./MemoryCandidateCard";
import {
  RuntimeManifestPreviewCard,
  type ManifestEntry,
} from "./RuntimeManifestPreviewCard";

/**
 * LINE F / H — Assistant Inbox / command center.
 *
 * A dense, dark, read-only command-center shell. It composes the four
 * card surfaces (evidence / learning loop / memory candidates / runtime
 * manifest preview) into labelled sections. Everything is presentational:
 * the inbox accepts arrays of items and renders them. It NEVER fires a
 * callback on mount and exposes no enable/approve affordance — it is a
 * read surface, not a control panel.
 *
 * LINE H adds an explicit per-section DATA SOURCE label so a viewer can
 * never confuse "live" (observed real app state) with "예시(fixture)"
 * (illustrative example) or an honest empty state. Honesty over polish:
 *   - "live"    → real, observed app state.
 *   - "empty"   → no live data yet, honest empty hint (never faked).
 *   - "example" → clearly-labeled 예시(fixture); never presented as live.
 */

/** Per-section data provenance — drives the source badge + empty handling. */
export type InboxSectionSource = "live" | "empty" | "example";

export type AssistantInboxSources = {
  evidence?: InboxSectionSource;
  learning?: InboxSectionSource;
  memory?: InboxSectionSource;
  manifest?: InboxSectionSource;
};

export type AssistantInboxProps = {
  evidence?: ReadonlyArray<EvidenceItem>;
  learningLoops?: ReadonlyArray<LearningLoopItem>;
  memoryCandidates?: ReadonlyArray<MemoryCandidateItem>;
  manifestEntries?: ReadonlyArray<ManifestEntry>;
  /** Per-section data provenance. Defaults to "example" per section (legacy fixture behavior). */
  sources?: AssistantInboxSources;
};

const SOURCE_LABEL: Record<InboxSectionSource, string> = {
  live: "live",
  empty: "no live data",
  example: "예시(fixture)",
};

function sourceVariant(source: InboxSectionSource) {
  if (source === "live") return "default" as const;
  if (source === "example") return "outline" as const;
  return "secondary" as const;
}

function SourceBadge({ id, source }: { id: string; source: InboxSectionSource }) {
  return (
    <Badge
      variant={sourceVariant(source)}
      data-testid={`assistant-inbox-source-${id}`}
      data-source={source}
    >
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

function Section({
  id,
  title,
  count,
  emptyHint,
  source,
  children,
}: {
  id: string;
  title: string;
  count: number;
  emptyHint: string;
  source: InboxSectionSource;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-1.5"
      data-testid={`assistant-inbox-section-${id}`}
      data-count={count}
      data-source={source}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <Badge variant="outline" data-testid={`assistant-inbox-section-count-${id}`}>
          {count}
        </Badge>
        <SourceBadge id={id} source={source} />
      </div>
      {count === 0 ? (
        <p
          className="text-[11px] text-muted-foreground/70"
          data-testid={`assistant-inbox-section-empty-${id}`}
        >
          {emptyHint}
        </p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </section>
  );
}

export function AssistantInbox({
  evidence = [],
  learningLoops = [],
  memoryCandidates = [],
  manifestEntries = [],
  sources,
}: AssistantInboxProps) {
  const total =
    evidence.length + learningLoops.length + memoryCandidates.length + manifestEntries.length;
  // Default to "example" so a section without an explicit source is never
  // mistaken for live (legacy fixture-only callers keep their honest label).
  const evidenceSource = sources?.evidence ?? "example";
  const learningSource = sources?.learning ?? "example";
  const memorySource = sources?.memory ?? "example";
  const manifestSource = sources?.manifest ?? "example";
  const hasExample =
    evidenceSource === "example" ||
    learningSource === "example" ||
    memorySource === "example" ||
    manifestSource === "example";
  return (
    <Card
      className="border-white/10 bg-black/40 py-4"
      data-testid="assistant-inbox"
      data-total={total}
      data-has-example={hasExample ? "true" : "false"}
    >
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Inbox className="h-4 w-4 text-cyan-300/80" />
          <span className="text-sm font-semibold">Assistant Inbox</span>
          <Badge variant="secondary" data-testid="assistant-inbox-total">
            {total}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            read-only · 자동 실행/승인 없음
          </span>
          {hasExample ? (
            <span
              className="text-[11px] text-amber-300/80"
              data-testid="assistant-inbox-example-notice"
            >
              일부 섹션은 예시(fixture) — live 아님
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2">
        <Section
          id="evidence"
          title="Evidence"
          count={evidence.length}
          emptyHint="아직 관측된 evidence 없음 (OS core에는 도메인 evidence 없음)"
          source={evidenceSource}
        >
          {evidence.map((item) => (
            <EvidenceCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="learning"
          title="Learning Loops"
          count={learningLoops.length}
          emptyHint="아직 관측된 learning loop 없음"
          source={learningSource}
        >
          {learningLoops.map((item) => (
            <LearningLoopCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="memory"
          title="Memory Candidates"
          count={memoryCandidates.length}
          emptyHint="아직 memory candidate 없음"
          source={memorySource}
        >
          {memoryCandidates.map((item) => (
            <MemoryCandidateCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="manifest"
          title="Runtime Manifest Preview"
          count={manifestEntries.length}
          emptyHint="아직 manifest 항목 없음"
          source={manifestSource}
        >
          <RuntimeManifestPreviewCard entries={manifestEntries} />
        </Section>
      </CardContent>
    </Card>
  );
}
