import { Button } from "@/ui/button";
import type { EvidenceRef } from "./annexData";

export function AnnexCard({
  evidence,
  onAskAgent,
}: {
  evidence: EvidenceRef;
  onAskAgent?: (ref: EvidenceRef) => void;
}) {
  return (
    <article className="annex-card annex-card--evidence" data-relevance={evidence.relevance}>
      <div className="annex-card__body">
        <h3 className="annex-card__title">{evidence.title}</h3>
        <p className="annex-card__source">{evidence.source}</p>
      </div>
      {onAskAgent ? (
        <Button size="sm" variant="outline" onClick={() => onAskAgent(evidence)}>
          대화로
        </Button>
      ) : null}
    </article>
  );
}
