import { FileText } from "lucide-react";
import { Button } from "@/ui/button";
import type { EvidenceRef } from "./annexData";
import { AnnexCard } from "./AnnexCard";
import { AnnexEmptyState } from "./AnnexEmptyState";

export function AnnexEvidencePanel({
  refs,
  onAskAgent,
  onCreateCodingPacket,
  onViewApproval,
}: {
  refs: EvidenceRef[];
  onAskAgent?: (ref: EvidenceRef) => void;
  onCreateCodingPacket?: () => void;
  onViewApproval?: () => void;
}) {
  const showActionBar = Boolean(onCreateCodingPacket) || Boolean(onViewApproval);

  return (
    <div className="annex-v2__evidence">
      <div className="annex-v2__evidence-scroll">
        {refs.length > 0 ? (
          refs.map((ref) => <AnnexCard key={ref.id} evidence={ref} onAskAgent={onAskAgent} />)
        ) : (
          <AnnexEmptyState icon={FileText} title="근거가 없습니다" subtext="토론에서 근거가 수집되면 여기에 모입니다." />
        )}
      </div>

      {showActionBar ? (
        <div className="annex-v2__actionbar">
          {onCreateCodingPacket ? (
            <Button size="sm" variant="secondary" onClick={onCreateCodingPacket}>
              패킷으로
            </Button>
          ) : null}
          {onViewApproval ? (
            <Button size="sm" variant="outline" onClick={onViewApproval}>
              승인 큐
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
