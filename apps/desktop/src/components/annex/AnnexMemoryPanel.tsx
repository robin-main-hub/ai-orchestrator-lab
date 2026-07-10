import { Database } from "lucide-react";
import type { MemoryRecall } from "./annexData";
import { AnnexEmptyState } from "./AnnexEmptyState";

export function AnnexMemoryPanel({
  recall,
  onViewMemory,
}: {
  recall: MemoryRecall[];
  onViewMemory?: () => void;
}) {
  if (recall.length === 0) {
    return (
      <div className="annex-v2__scroll">
        <AnnexEmptyState icon={Database} title="기억 호출 내역이 없습니다" subtext="맥락 미리보기가 있으면 여기에 표시됩니다." />
      </div>
    );
  }

  return (
    <div className="annex-v2__scroll">
      <div className="annex-v2__memory">
        {recall.map((item) => {
          const inner = (
            <>
              <span className="annex-v2__memory-head">
                <span className="annex-v2__memory-key">{item.key}</span>
                <span className="annex-v2__memory-confidence aol-mono">{item.confidence}%</span>
              </span>
              <span className="annex-v2__memory-value">{item.value}</span>
            </>
          );
          return onViewMemory ? (
            <button className="annex-card annex-card--interactive annex-v2__memory-item" key={item.key} onClick={onViewMemory} type="button">
              {inner}
            </button>
          ) : (
            <div className="annex-card annex-v2__memory-item" key={item.key}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
