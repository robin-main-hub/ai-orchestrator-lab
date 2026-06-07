import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { CodingPacket, InsightFinding, ReviewMode } from "@ai-orchestrator/protocol";
import { insightCategoryLabel, reviewModeLabel } from "../lib/uiLabels";

export function CodingPacketPanel({
  insightFindings,
  onReviewModeChange,
  packet,
  reviewMode,
  onVerify,
}: {
  insightFindings: InsightFinding[];
  onReviewModeChange: (mode: ReviewMode) => void;
  packet: CodingPacket;
  reviewMode: ReviewMode;
  onVerify?: () => Promise<void>;
}) {
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerifyClick = async () => {
    if (!onVerify || isVerifying) return;
    setIsVerifying(true);
    try {
      await onVerify();
    } finally {
      setIsVerifying(false);
    }
  };

  const columns = [
    ["결정", packet.decisions],
    ["제약", packet.constraints],
    ["구현", packet.implementationPlan],
    ["검증", packet.verificationPlan],
  ] as const;

  return (
    <section className="coding-packet">
      <header>
        <div>
          <span>코딩 패킷</span>
          <h2>{packet.goal}</h2>
        </div>
        <button 
          className="ghost-button" 
          type="button"
          onClick={handleVerifyClick}
          title={onVerify ? "코딩 패킷 구조 검증" : "검증 러너 미연결"}
          disabled={isVerifying || !onVerify}
        >
          {isVerifying ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          {isVerifying ? "검증 중..." : "구조 검증"}
        </button>
      </header>
      <section className="review-insight-panel" aria-label="리뷰와 인사이트 제어">
        <div className="review-mode-toggle">
          <span>리뷰</span>
          {(["quick", "deep"] as ReviewMode[]).map((mode) => (
            <button
              className={reviewMode === mode ? "active" : ""}
              key={mode}
              onClick={() => onReviewModeChange(mode)}
              type="button"
            >
              {reviewModeLabel(mode)}
            </button>
          ))}
        </div>
        <div className="rubric-chip-list">
          {["plan_coverage", "code_quality", "test_coverage", "convention", "invariant_checks"].map((rubric) => (
            <span key={rubric}>{rubric}</span>
          ))}
        </div>
        <div className="insight-chip-list">
          {insightFindings.slice(0, 6).map((finding) => (
            <span className={finding.status} key={finding.id}>
              {insightCategoryLabel(finding.category)}
            </span>
          ))}
        </div>
      </section>
      <div className="packet-grid">
        {columns.map(([title, items]) => (
          <div className="packet-column" key={title}>
            <strong>{title}</strong>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
