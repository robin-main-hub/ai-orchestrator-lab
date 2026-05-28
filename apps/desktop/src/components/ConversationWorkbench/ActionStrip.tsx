import React from "react";
import {
  Swords,
  Package,
  Play,
  Archive,
  Smartphone,
  Database,
} from "lucide-react";
import type { BranchExperiment } from "@ai-orchestrator/protocol";
import { Button } from "@/ui/button";
import { DelegationChip } from "./Composer";
import { branchStatusLabel } from "../../lib/uiLabels";

export function ActionStrip({
  adoptedBranchCount,
  branchExperiments,
  canDelegate,
  latestBranch,
  onAdoptBranch,
  onBackupProjection,
  onCreateAgentRun,
  onCreateBranch,
  onCreateCodingPacket,
  onImportTelegram,
  onPromoteToDebate,
  showOverflowBranchControls,
}: {
  adoptedBranchCount: number;
  branchExperiments: BranchExperiment[];
  canDelegate: boolean;
  latestBranch?: BranchExperiment;
  onAdoptBranch: () => void;
  onBackupProjection: () => void;
  onCreateAgentRun: () => void;
  onCreateBranch: () => void;
  onCreateCodingPacket: () => void;
  onImportTelegram: () => void;
  onPromoteToDebate: () => void;
  showOverflowBranchControls: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card/30 px-4 py-2">
      <DelegationChip
        disabled={!canDelegate}
        icon={<Swords className="h-3.5 w-3.5" />}
        label="토론 전환"
        onClick={onPromoteToDebate}
        shortcut="⌘⇧D"
      />
      <DelegationChip
        icon={<Package className="h-3.5 w-3.5" />}
        label="패킷 생성"
        onClick={onCreateCodingPacket}
      />
      <DelegationChip
        icon={<Play className="h-3.5 w-3.5" />}
        label="실행 슬롯"
        onClick={onCreateAgentRun}
      />
      <Button
        className="h-7 gap-1.5 text-xs"
        onClick={onBackupProjection}
        size="sm"
        variant="ghost"
      >
        <Archive className="h-3.5 w-3.5" />
        백업 상태
      </Button>
      <Button
        className="h-7 gap-1.5 text-xs"
        onClick={onImportTelegram}
        size="sm"
        variant="ghost"
      >
        <Smartphone className="h-3.5 w-3.5" />
        Telegram
      </Button>
      {showOverflowBranchControls ? (
        <div className="ml-auto flex items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1 text-[10px]">
          <Database className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Branch</span>
          <span className="font-mono text-foreground">
            {branchExperiments.length} · 채택 {adoptedBranchCount}
          </span>
          {latestBranch ? (
            <span
              className="text-muted-foreground"
              title={latestBranch.summary}
            >
              · {branchStatusLabel(latestBranch.status)}
            </span>
          ) : null}
          <Button
            className="h-6 px-2 text-[10px]"
            onClick={onCreateBranch}
            size="sm"
            variant="ghost"
          >
            분기
          </Button>
          <Button
            className="h-6 px-2 text-[10px]"
            disabled={!branchExperiments.some((b) => b.status !== "adopted")}
            onClick={onAdoptBranch}
            size="sm"
            variant="ghost"
          >
            채택
          </Button>
        </div>
      ) : null}
    </div>
  );
}
