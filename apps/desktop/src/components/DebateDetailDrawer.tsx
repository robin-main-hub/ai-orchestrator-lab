import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/ui/sheet";
import { DebateTracePanel } from "./DebateTracePanel";
import type { Stage3DebateUtteranceView } from "../types";
import { ScrollArea } from "@/ui/scroll-area"; // ScrollArea 컴포넌트 유무 확인 후 폴백 가능하게 구성

export function DebateDetailDrawer({
  utterance,
  allUtterances,
  onSelectUtterance,
  onHandoffConversation,
  onClose,
}: {
  utterance: Stage3DebateUtteranceView | null;
  allUtterances: Stage3DebateUtteranceView[];
  onSelectUtterance: (u: Stage3DebateUtteranceView) => void;
  onHandoffConversation?: (u: Stage3DebateUtteranceView) => void;
  onClose: () => void;
}) {
  const isOpen = utterance !== null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[460px] max-w-[90vw] border-l border-border bg-card text-card-foreground p-0 flex flex-col h-full shadow-2xl focus:outline-hidden"
      >
        <SheetHeader className="p-4 border-b border-border/60 shrink-0">
          <SheetTitle className="text-sm font-semibold tracking-tight">
            토론 발화 상세 계보
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground mt-0.5">
            이 발화가 생성된 인과적 맥락과 후속 수용/기각 관계를 추적합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {utterance && (
            <DebateTracePanel
              utterance={utterance}
              allUtterances={allUtterances}
              onSelectUtterance={onSelectUtterance}
              onHandoffConversation={onHandoffConversation}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
