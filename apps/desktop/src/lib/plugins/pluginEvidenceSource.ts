/**
 * Batch 14 LINE C — generic evidence ingress contract. A plugin may declare
 * generic EvidenceRefs. This is NOT trusted memory: evidence never becomes
 * trusted/active automatically and never writes memory by itself. Only
 * approved/published evidence maps to a SUGGESTED candidate (observed:false) that
 * the existing generic batch-remember bridge could later pick up. Pure; generic.
 */
export type PluginEvidenceTrust = "untrusted" | "limited" | "suggested";
export type PluginEvidenceApproval = "draft" | "approved" | "published";

export type PluginEvidence = {
  pluginId: string;
  sourceRef: string;
  title: string;
  summary?: string;
  observedAt?: string;
  contentHash?: string;
  trustHint: PluginEvidenceTrust;
  approvalState?: PluginEvidenceApproval;
};

/** A read-only candidate derived from plugin evidence. Never trusted/active. */
export type PluginEvidenceCandidate = {
  id: string;
  pluginId: string;
  sourceRef: string;
  title: string;
  summary?: string;
  status: "suggested";
  observed: false;
  trust: PluginEvidenceTrust;
  note: string;
};

const TRUSTS: ReadonlyArray<PluginEvidenceTrust> = ["untrusted", "limited", "suggested"];

function isValidEvidence(e: PluginEvidence): boolean {
  return (
    typeof e.pluginId === "string" &&
    e.pluginId.trim().length > 0 &&
    typeof e.sourceRef === "string" &&
    e.sourceRef.trim().length > 0 &&
    typeof e.title === "string" &&
    e.title.trim().length > 0 &&
    TRUSTS.includes(e.trustHint)
  );
}

/**
 * Project plugin evidence into read-only suggested candidates. Only
 * approved/published evidence qualifies (draft/undefined → not a candidate).
 * Trust stays limited/suggested — never escalated to trusted/active; observed is
 * always false (nothing is written). Generic-only.
 */
export function projectPluginEvidenceCandidates(
  items: ReadonlyArray<PluginEvidence> = [],
): PluginEvidenceCandidate[] {
  return items
    .filter(isValidEvidence)
    .filter((e) => e.approvalState === "approved" || e.approvalState === "published")
    .map((e) => ({
      id: `${e.pluginId}:${e.sourceRef}`,
      pluginId: e.pluginId,
      sourceRef: e.sourceRef,
      title: e.title,
      summary: e.summary,
      status: "suggested",
      observed: false,
      // never auto-trusted: clamp "untrusted" up to "limited", keep limited/suggested as-is.
      trust: e.trustHint === "untrusted" ? "limited" : e.trustHint,
      note: "plugin evidence · suggested · not written (generic bridge only)",
    }));
}
