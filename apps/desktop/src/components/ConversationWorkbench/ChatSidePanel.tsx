import { useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Eye,
  FileDiff,
  Files,
  ListTodo,
  PanelRight,
  TerminalSquare,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { cn } from "@/lib/utils";
import {
  CHAT_SIDE_PANEL_MAX_WIDTH_PX,
  CHAT_SIDE_PANEL_MIN_WIDTH_PX,
  CHAT_SIDE_PANEL_WIDTH_STORAGE_KEY,
  panelWidthAfterKey,
  panelWidthFromPointerX,
  parseStoredPanelWidth,
} from "../../lib/chatSidePanelWidth";

/**
 * Codex식 확장 패널 — 대화를 가리지 않는 우측 분할 패널.
 *
 * 우상단의 작은 ▣˅ 버튼이 메뉴(미리보기/Diff/터미널/파일/백그라운드 작업/계획)를
 * 열고, 선택하면 대화 옆에 좁은 패널로 *분할* 표시된다. 에이전트 출격 현황
 * 같은 부가 정보는 더 이상 스레드를 덮지 않고 여기서 본다.
 */

export type ChatSidePanelMode =
  | "none"
  | "diff"
  | "terminal"
  | "files"
  | "background"
  | "plan"
  | "agents";

const PANEL_ITEMS: Array<{
  mode: Exclude<ChatSidePanelMode, "none">;
  label: string;
  icon: typeof Eye;
  shortcut?: string;
}> = [
  { mode: "diff", label: "Diff", icon: FileDiff, shortcut: "⇧+Ctrl+D" },
  { mode: "terminal", label: "터미널", icon: TerminalSquare, shortcut: "Ctrl+`" },
  { mode: "files", label: "파일", icon: Files, shortcut: "⇧+Ctrl+F" },
  { mode: "background", label: "백그라운드 작업", icon: Users },
  { mode: "plan", label: "계획", icon: ListTodo },
  { mode: "agents", label: "에이전트", icon: Bot },
];

export function panelLabel(mode: ChatSidePanelMode): string {
  return PANEL_ITEMS.find((item) => item.mode === mode)?.label ?? "";
}

/** 우상단 토글 버튼 + 드롭다운 메뉴 */
export function ChatSidePanelMenu({
  mode,
  onChangeMode,
  backgroundBadge,
}: {
  mode: ChatSidePanelMode;
  onChangeMode: (mode: ChatSidePanelMode) => void;
  /** 백그라운드 작업 개수 배지 (출격 중인 에이전트 수) */
  backgroundBadge?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label="확장 패널 메뉴"
          className={cn(
            "relative h-7 gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-zinc-400 hover:text-zinc-100",
            mode !== "none" && "border-violet-300/30 text-violet-200",
          )}
          size="sm"
          variant="ghost"
        >
          <PanelRight className="h-3.5 w-3.5" />
          <ChevronDown className="h-3 w-3" />
          {backgroundBadge ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-violet-500 px-0.5 text-[9px] font-bold text-white">
              {backgroundBadge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-xl"
        sideOffset={6}
      >
        {PANEL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = mode === item.mode;
          return (
            <button
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                active ? "bg-zinc-800 text-zinc-50" : "text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100",
              )}
              key={item.mode}
              onClick={() => {
                onChangeMode(active ? "none" : item.mode);
                setOpen(false);
              }}
              type="button"
            >
              <Icon className="h-3.5 w-3.5 text-zinc-500" />
              <span className="flex-1">{item.label}</span>
              {item.mode === "background" && backgroundBadge ? (
                <span className="rounded-full bg-violet-500/20 px-1.5 text-[10px] text-violet-200">{backgroundBadge}</span>
              ) : null}
              {active ? <span className="text-violet-300">✓</span> : null}
              {item.shortcut ? <kbd className="text-[10px] text-zinc-600">{item.shortcut}</kbd> : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** 우측 분할 패널 셸 — 내용은 children으로 주입 */
export function ChatSidePanel({
  mode,
  onClose,
  children,
}: {
  mode: ChatSidePanelMode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [widthPx, setWidthPx] = useState<number>(() => {
    try {
      return parseStoredPanelWidth(window.localStorage.getItem(CHAT_SIDE_PANEL_WIDTH_STORAGE_KEY));
    } catch {
      return parseStoredPanelWidth(undefined);
    }
  });
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_SIDE_PANEL_WIDTH_STORAGE_KEY, String(widthPx));
    } catch {
      // storage 불가 환경(사파리 프라이빗 등)에서는 세션 한정으로만 유지
    }
  }, [widthPx]);

  if (mode === "none") return null;

  const onResizerPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const anchorRight = asideRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 합성/자동화 이벤트는 capture가 안 될 수 있음 — window 리스너로 충분
    }
    setDragging(true);
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setWidthPx(panelWidthFromPointerX(anchorRight, moveEvent.clientX));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  };

  return (
    <>
      <button
        aria-label="패널 너비 조절"
        aria-orientation="vertical"
        aria-valuemax={CHAT_SIDE_PANEL_MAX_WIDTH_PX}
        aria-valuemin={CHAT_SIDE_PANEL_MIN_WIDTH_PX}
        aria-valuenow={widthPx}
        className={cn(
          "group relative w-1.5 shrink-0 cursor-col-resize touch-none rounded-none border-0 bg-transparent p-0 outline-none max-md:hidden",
          "focus-visible:ring-2 focus-visible:ring-cyan-300/60",
        )}
        onKeyDown={(event) => {
          const next = panelWidthAfterKey(widthPx, event.key, event.shiftKey);
          if (next !== undefined) {
            event.preventDefault();
            setWidthPx(next);
          }
        }}
        onPointerDown={onResizerPointerDown}
        role="separator"
        title="드래그해서 패널 폭 조절"
        type="button"
      >
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 transition-all",
            "group-hover:w-[3px] group-hover:bg-cyan-300/70",
            dragging && "w-[3px] bg-cyan-300/90",
          )}
        />
      </button>
      <aside
        aria-label={`${panelLabel(mode)} 패널`}
        className="flex max-w-[44vw] shrink-0 flex-col border-l border-white/10 bg-zinc-950/95 backdrop-blur-xl max-md:hidden"
        ref={asideRef}
        style={{ width: `${widthPx}px` }}
      >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <span className="text-[12px] font-semibold text-zinc-200">{panelLabel(mode)}</span>
        <span className="flex-1" />
        <button
          aria-label="패널 닫기"
          className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          onClick={onClose}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
        <div className="chat-side-panel-body min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}

/** 아직 데이터 소스가 연결되지 않은 모드의 정직한 안내 */
export function ChatSidePanelStub({ mode }: { mode: ChatSidePanelMode }) {
  const guide: Partial<Record<ChatSidePanelMode, string>> = {
    diff: "에이전트가 만든 변경 diff가 여기에 표시됩니다. 코딩 탭에서 edit/write 도구가 실행되면 자동으로 누적됩니다.",
    files: "이 대화에서 멘션(@경로)되었거나 에이전트가 만진 파일 목록이 여기에 모입니다.",
    agents: "에이전트 레일이 여기로 들어옵니다. 모델/프로바이더 배정과 에이전트 선택을 패널에서 바로 합니다.",
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-[12.5px] leading-relaxed text-zinc-500">{guide[mode] ?? "준비 중입니다."}</p>
    </div>
  );
}
