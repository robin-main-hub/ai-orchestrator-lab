import React from "react";
import { AlertCircle, ArrowRight, CheckSquare, Handshake, UserRoundCheck } from "lucide-react";
import type { OperatorCockpitHandoff } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";

export function HandoffCard({
  handoffs,
  onApproveHandoff,
}: {
  handoffs: OperatorCockpitHandoff[];
  onApproveHandoff?: (handoffId: string) => void;
}) {
  return (
    <GlassPanel>
      <GlassPanelHeader action={<Badge color={handoffs.length > 0 ? "blue" : "gray"}>{handoffs.length}건 활성</Badge>}>
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">작업 인계</h3>
        </div>
      </GlassPanelHeader>
      {handoffs.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">활성 인계가 없습니다.</div>
      ) : (
        <div className="space-y-3 p-3">
          {handoffs.map((handoff, idx) => (
            <article key={`${handoff.ownerAgentId}-${idx}`} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <UserRoundCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">담당자</span>
                  <span className="block truncate text-sm font-semibold text-primary">{handoff.ownerAgentId}</span>
                </div>
              </div>

              <div className="mb-4">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">다음 행동</span>
                <div className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{handoff.nextAction}</span>
                </div>
              </div>

              {handoff.missingInfoSlots.length > 0 && (
                <div className="rounded-lg border border-warning/15 bg-warning/5 p-3">
                  <span className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-warning">
                    <AlertCircle className="h-3.5 w-3.5" /> 부족한 정보
                  </span>
                  <ul className="space-y-1.5">
                    {handoff.missingInfoSlots.map((slot, i) => (
                      <li key={`${slot.id}-${i}`} className="flex items-center gap-2 text-xs text-warning">
                        <span className="h-1 w-1 rounded-full bg-warning" />
                        <span>{slot.label}</span>
                        {slot.required ? <Badge color="yellow" size="xs">필수</Badge> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {handoff.id && handoff.approvalState === "required" && onApproveHandoff ? (
                <button
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary/45 hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  onClick={() => onApproveHandoff(handoff.id as string)}
                  type="button"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {handoff.targetSurface === "execution_slot" ? "실행 슬롯 인계 승인" : "인계 승인"}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
