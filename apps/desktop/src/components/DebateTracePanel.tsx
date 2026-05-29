import { useMemo } from "react";
import {
  ArrowDown,
  CornerDownRight,
  CheckCircle2,
  XCircle,
  Link2,
  FileCode2,
  Send,
  User,
} from "lucide-react";
import { List } from "react-window";
import type { Stage3DebateUtteranceView } from "../types";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";
import { StatusBadge } from "@/ui/status-badge";
import { cn } from "@/lib/utils";

const Row = ({
  index,
  style,
  descendants,
  utterance: parentUtterance,
  onSelectUtterance: handleSelect,
}: {
  index: number;
  style: React.CSSProperties;
  descendants: Stage3DebateUtteranceView[];
  utterance: Stage3DebateUtteranceView;
  onSelectUtterance: (u: Stage3DebateUtteranceView) => void;
}) => {
  const desc = descendants[index];
  if (!desc) return null;
  const isAccepted = parentUtterance.acceptedBy?.includes(desc.id);
  const isRejected = parentUtterance.rejectedBy?.includes(desc.id);
  return (
    <div style={style} className="pb-2 pr-1 pl-6 relative">
      {/* Dashed vertical provenance line */}
      <div className="absolute left-2.5 top-0 bottom-0 w-0.5 border-l border-dashed border-border/60" />
      {/* Branch/Connector symbol */}
      <div className="absolute left-[7px] top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border/80 text-muted-foreground z-10">
        <CornerDownRight className="h-2.5 w-2.5" />
      </div>
      <div
        onClick={() => handleSelect(desc)}
        className={cn(
          "flex flex-col h-[calc(100%-8px)] cursor-pointer rounded-md border p-2 px-2.5 transition-colors bg-card/30 hover:bg-card justify-center",
          isAccepted
            ? "border-success/30 hover:border-success/60"
            : isRejected
            ? "border-destructive/30 hover:border-destructive/60"
            : "border-border/50 hover:border-primary/40"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AvatarWithStatus
              initials={desc.agentName.slice(0, 2).toUpperCase()}
              roleColor={roleColorFromRole(desc.agentName.toLowerCase())}
              size="sm"
            />
            <span className="text-xs font-semibold text-foreground">
              {desc.agentName}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isAccepted && (
              <StatusBadge variant="success" size="sm" className="gap-0.5">
                <CheckCircle2 className="h-2 w-2" /> 수용
              </StatusBadge>
            )}
            {isRejected && (
              <StatusBadge variant="danger" size="sm" className="gap-0.5">
                <XCircle className="h-2 w-2" /> 기각
              </StatusBadge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {desc.roundTitle}
            </span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
          {desc.content}
        </p>
      </div>
    </div>
  );
};

export function DebateTracePanel({
  utterance,
  allUtterances,
  onSelectUtterance,
  onHandoffConversation,
}: {
  utterance: Stage3DebateUtteranceView;
  allUtterances: Stage3DebateUtteranceView[];
  onSelectUtterance: (u: Stage3DebateUtteranceView) => void;
  onHandoffConversation?: (u: Stage3DebateUtteranceView) => void;
}) {
  const utteranceMap = useMemo(() => {
    const map = new Map<string, Stage3DebateUtteranceView>();
    for (const u of allUtterances) {
      map.set(u.id, u);
    }
    return map;
  }, [allUtterances]);

  // 1. Ancestors (부모 계보 추적)
  const ancestors = useMemo(() => {
    const list: Stage3DebateUtteranceView[] = [];
    let current = utterance;
    while (current.parentUtteranceId) {
      const parent = utteranceMap.get(current.parentUtteranceId);
      if (!parent || list.some((u) => u.id === parent.id)) {
        // 무한 루프 방지 및 부모 부재 시 탈출
        break;
      }
      list.unshift(parent); // 가장 오래된 부모가 맨 앞에 오도록 함
      current = parent;
    }
    return list;
  }, [utterance, utteranceMap]);

  // 2. Descendants (후속 발언 추적)
  const descendants = useMemo(() => {
    return allUtterances.filter(
      (u) =>
        u.parentUtteranceId === utterance.id ||
        utterance.acceptedBy?.includes(u.id) ||
        utterance.rejectedBy?.includes(u.id)
    );
  }, [utterance.id, utterance.acceptedBy, utterance.rejectedBy, allUtterances]);

  const rowProps = useMemo(() => ({
    descendants,
    utterance,
    onSelectUtterance
  }), [descendants, utterance, onSelectUtterance]);

  return (
    <div className="space-y-6">
      {/* ── SECTION: ANCESTORS (상위 맥락) ── */}
      {ancestors.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            이전 발화 맥락 (Ancestors)
          </h4>
          <div className="relative border-l-2 border-dashed border-border/60 ml-4 pl-5 space-y-4">
            {ancestors.map((anc) => (
              <div
                key={anc.id}
                onClick={() => onSelectUtterance(anc)}
                className="group relative cursor-pointer rounded-md border border-border/50 bg-card/50 p-2.5 transition-colors hover:border-primary/40 hover:bg-card"
              >
                {/* 수직 라인과의 연결 고리 아이콘 */}
                <div className="absolute -left-[27px] top-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border/80 text-muted-foreground">
                  <CornerDownRight className="h-2.5 w-2.5" />
                </div>
                <div className="flex items-center gap-1.5 justify-between">
                  <div className="flex items-center gap-1.5">
                    <AvatarWithStatus
                      initials={anc.agentName.slice(0, 2).toUpperCase()}
                      roleColor={roleColorFromRole(anc.agentName.toLowerCase())}
                      size="sm"
                    />
                    <span className="text-xs font-semibold text-foreground">
                      {anc.agentName}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {anc.roundTitle}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {anc.content}
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-center ml-4">
            <ArrowDown className="h-4 w-4 text-muted-foreground/40 animate-pulse" />
          </div>
        </div>
      )}

      {/* ── SECTION: TARGET NODE (현재 선택 발화) ── */}
      <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AvatarWithStatus
              initials={utterance.agentName.slice(0, 2).toUpperCase()}
              roleColor={roleColorFromRole(utterance.agentName.toLowerCase())}
              size="sm"
            />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {utterance.agentName}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {utterance.roundTitle} · {new Date(utterance.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
          {utterance.decisionId && (
            <StatusBadge variant="primary" size="sm" className="font-mono gap-1">
              DECISION
            </StatusBadge>
          )}
        </div>

        <p className="text-xs leading-relaxed text-foreground bg-background/40 p-2.5 rounded-md border border-border/20 whitespace-pre-wrap">
          {utterance.content}
        </p>

        {/* ── Provenance Meta (Evidence, Coding) ── */}
        {(utterance.evidenceRefIds?.length ?? 0) > 0 || (utterance.codingImpactRefs?.length ?? 0) > 0 ? (
          <div className="pt-2 border-t border-border/40 space-y-2">
            {utterance.evidenceRefIds && utterance.evidenceRefIds.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> 인용된 근거 문서 (Evidence)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {utterance.evidenceRefIds.map((ref) => (
                    <a
                      key={ref}
                      href={`file:///${ref}`}
                      className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border/40 hover:text-foreground hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      {ref.split("/").pop()}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {utterance.codingImpactRefs && utterance.codingImpactRefs.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                  <FileCode2 className="h-3 w-3" /> 코딩 계획 영향 (Coding Impact)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {utterance.codingImpactRefs.map((ref) => (
                    <span
                      key={ref}
                      className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary border border-primary/20"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Handoff Button */}
        {onHandoffConversation && (
          <div className="pt-2 flex justify-end border-t border-border/20">
            <button
              onClick={() => onHandoffConversation(utterance)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/95 transition-colors shadow-sm cursor-pointer"
            >
              <Send className="h-3 w-3" />
              이 발언으로 후속 대화 시작
            </button>
          </div>
        )}
      </div>

      {/* ── SECTION: DESCENDANTS (후속 발언 및 리액션) ── */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          후속 연계 발화 (Descendants)
        </h4>
        {descendants.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic pl-2">
            이 발화 이후 연계된 후속 발언이 없습니다.
          </p>
        ) : (
          <List
            rowCount={descendants.length}
            rowHeight={90}
            rowProps={rowProps}
            style={{ height: Math.min(descendants.length * 90, 450), width: "100%" }}
            rowComponent={Row as any}
          />
        )}
      </div>
    </div>
  );
}
