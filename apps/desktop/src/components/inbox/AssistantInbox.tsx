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
 * LINE F — Assistant Inbox / command center.
 *
 * A dense, dark, read-only command-center shell. It composes the four
 * card surfaces (evidence / learning loop / memory candidates / runtime
 * manifest preview) into labelled sections. Everything is presentational:
 * the inbox accepts arrays of items and renders them. It NEVER fires a
 * callback on mount and exposes no enable/approve affordance — it is a
 * read surface, not a control panel.
 */

export type AssistantInboxProps = {
  evidence?: ReadonlyArray<EvidenceItem>;
  learningLoops?: ReadonlyArray<LearningLoopItem>;
  memoryCandidates?: ReadonlyArray<MemoryCandidateItem>;
  manifestEntries?: ReadonlyArray<ManifestEntry>;
};

function Section({
  id,
  title,
  count,
  emptyHint,
  children,
}: {
  id: string;
  title: string;
  count: number;
  emptyHint: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-1.5"
      data-testid={`assistant-inbox-section-${id}`}
      data-count={count}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <Badge variant="outline" data-testid={`assistant-inbox-section-count-${id}`}>
          {count}
        </Badge>
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
}: AssistantInboxProps) {
  const total =
    evidence.length + learningLoops.length + memoryCandidates.length + manifestEntries.length;
  return (
    <Card
      className="border-white/10 bg-black/40 py-4"
      data-testid="assistant-inbox"
      data-total={total}
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
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2">
        <Section
          id="evidence"
          title="Evidence"
          count={evidence.length}
          emptyHint="no evidence items"
        >
          {evidence.map((item) => (
            <EvidenceCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="learning"
          title="Learning Loops"
          count={learningLoops.length}
          emptyHint="no learning loops"
        >
          {learningLoops.map((item) => (
            <LearningLoopCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="memory"
          title="Memory Candidates"
          count={memoryCandidates.length}
          emptyHint="no memory candidates"
        >
          {memoryCandidates.map((item) => (
            <MemoryCandidateCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="manifest"
          title="Runtime Manifest Preview"
          count={manifestEntries.length}
          emptyHint="no manifest entries"
        >
          <RuntimeManifestPreviewCard entries={manifestEntries} />
        </Section>
      </CardContent>
    </Card>
  );
}
