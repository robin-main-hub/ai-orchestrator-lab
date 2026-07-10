import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

/**
 * 페르소나 선택 드롭다운: 자율 실행 패널의 페르소나 고르는 자리. 예전의
 * native `<input list>` + `<datalist>`는 떨어져 뜨고 타이핑 필터에 의존해
 * 목록이 안 보이는 문제가 있어, 형제인 RolePaneSelect처럼 Radix
 * DropdownMenu 팝오버(앵커 고정·포털·키보드 지원)로 대체한다. 순수 표시용 —
 * 데이터 패칭은 상위(컨테이너)가 담당한다.
 */
export function PersonaPaneSelect({
  value,
  options,
  disabled,
  onChange,
  resolveAvatar,
  placeholder,
}: {
  value: string;
  options: ReadonlyArray<string>;
  disabled?: boolean;
  onChange: (personaName: string) => void;
  /** 페르소나 이름 -> 아바타 URL 해석기 (있으면 트리거/행에 초상 표시) */
  resolveAvatar?: (personaName: string) => string | undefined;
  placeholder?: string;
}) {
  const triggerAvatar = value ? resolveAvatar?.(value) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="페르소나 선택" className="persona-pane-trigger" disabled={disabled} type="button">
          {triggerAvatar ? (
            <img alt="" className="persona-pane-trigger-avatar" height={18} src={triggerAvatar} width={18} />
          ) : null}
          <span>{value || (placeholder ?? "페르소나 선택")}</span>
          <ChevronDown className="persona-pane-trigger-chevron" size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {options.map((name) => {
          const avatar = resolveAvatar?.(name);
          return (
            <DropdownMenuItem key={name} onSelect={() => onChange(name)}>
              {avatar ? (
                <img alt="" className="persona-pane-option-avatar" height={18} src={avatar} width={18} />
              ) : null}
              <span>{name}</span>
              {name === value ? (
                <span className="ml-auto text-[10px] text-primary font-medium">사용 중</span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
