import { ChevronDown } from "lucide-react";
import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { StatusBadge } from "@/ui/status-badge";
import { rosterRowVariant, type RolePaneOption } from "../lib/autonomyRoster";

/**
 * 역할 pane 선택 드롭다운: 각 역할 옆에 해당 pane의 점유 상태(비어 있음 /
 * 누가 점유)를 함께 보여줘, 별도의 로스터 줄글 없이 고르는 자리에서 상태를
 * 읽게 한다. 점유된 역할은 비활성 — 소환해도 no_free_pane으로 실패하므로.
 */
export function RolePaneSelect({
  value,
  options,
  disabled,
  onChange,
  resolveAvatar,
  summary,
}: {
  value: TmuxPaneRole;
  options: ReadonlyArray<RolePaneOption>;
  disabled?: boolean;
  onChange: (role: TmuxPaneRole) => void;
  /** 점유 중인 페르소나의 아바타 URL 해석기 (있으면 메뉴 행에 초상 표시) */
  resolveAvatar?: (agentId: string) => string | undefined;
  /** 메뉴 머리글의 풀 요약 (예: "점유 1 · 비어있음 6") */
  summary?: string;
}) {
  const selected = options.find((option) => option.role === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="역할 pane 선택" className="role-pane-trigger" disabled={disabled} type="button">
          <span className="role-pane-trigger-role">{value}</span>
          {selected ? (
            <StatusBadge size="sm" variant={rosterRowVariant(selected.busy)}>
              {selected.statusLabel}
            </StatusBadge>
          ) : null}
          <ChevronDown className="role-pane-trigger-chevron" size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {summary ? (
          <>
            <DropdownMenuLabel>{summary}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {options.map((option) => {
          const avatar = option.occupantId ? resolveAvatar?.(option.occupantId) : undefined;
          return (
            <DropdownMenuItem disabled={option.busy} key={option.role} onSelect={() => onChange(option.role)}>
              <span>{option.role}</span>
              {option.role === value ? (
                <span className="text-[10px] text-primary font-medium">사용 중</span>
              ) : null}
              <span className="ml-auto flex items-center gap-1.5">
                {avatar ? <img alt="" className="rounded-full" height={16} src={avatar} width={16} /> : null}
                <StatusBadge size="sm" variant={rosterRowVariant(option.busy)}>
                  {option.statusLabel}
                </StatusBadge>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
