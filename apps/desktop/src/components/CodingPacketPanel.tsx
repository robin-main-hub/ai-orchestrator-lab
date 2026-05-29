import { useState } from "react";
import { CheckCircle2, Loader2, XCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { CodingPacket, InsightFinding, ReviewMode } from "@ai-orchestrator/protocol";
import { insightCategoryLabel, reviewModeLabel } from "../lib/uiLabels";
import { cn } from "@/lib/utils";

export type VerificationReport = {
  id: string;
  status: "passed" | "warning" | "blocked" | "failed";
  checks: Array<{
    label: string;
    status: "pass" | "warn" | "fail";
  }>;
  notes: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

export function CodingPacketPanel({
  insightFindings,
  onReviewModeChange,
  packet,
  reviewMode,
  onVerify,
  verifier,
}: {
  insightFindings: InsightFinding[];
  onReviewModeChange: (mode: ReviewMode) => void;
  packet: CodingPacket;
  reviewMode: ReviewMode;
  onVerify?: () => Promise<void>;
  verifier?: VerificationReport;
}) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [showConsole, setShowConsole] = useState(true);

  const handleVerifyClick = async () => {
    if (!onVerify || isVerifying) return;
    setIsVerifying(true);
    try {
      await onVerify();
    } finally {
      setIsVerifying(false);
    }
  };

  const formatConsoleLogs = (log?: string) => {
    if (!log) return null;
    
    // Split by CSI escape sequence, capturing the codes (parameters) and the action letter.
    const parts = log.split(/\u001b\[([0-9;]*)([a-zA-Z])/);
    const elements: React.ReactNode[] = [];
    
    let currentClassName = "text-foreground/90";
    let isBold = false;
    let textColorClass = "";
    
    // The split array will look like:
    // [text, codes, action, text, codes, action, text, ...]
    // We process it in steps of 3.
    for (let i = 0; i < parts.length; i += 3) {
      const textSegment = parts[i];
      if (textSegment) {
        elements.push(
          <span key={i} className={currentClassName}>
            {textSegment}
          </span>
        );
      }
      
      // Check if there is a next match
      if (i + 2 < parts.length) {
        const codes = parts[i + 1] || "";
        const action = parts[i + 2];
        
        if (action === "m") {
          if (codes === "0" || codes === "") {
            isBold = false;
            textColorClass = "";
          } else {
            const codeArray = codes.split(";");
            for (const code of codeArray) {
              if (code === "0") {
                isBold = false;
                textColorClass = "";
              } else if (code === "1") {
                isBold = true;
              } else if (code === "22") {
                isBold = false;
              } else if (code === "31") {
                textColorClass = "text-destructive";
              } else if (code === "32") {
                textColorClass = "text-success";
              } else if (code === "33") {
                textColorClass = "text-warning";
              } else if (code === "34") {
                textColorClass = "text-primary";
              } else if (code === "36") {
                textColorClass = "text-cyan-500";
              } else if (code === "90") {
                textColorClass = "text-muted-foreground";
              } else if (code === "39") {
                textColorClass = "";
              }
            }
          }
          
          const classes: string[] = [];
          if (textColorClass) {
            classes.push(textColorClass);
          } else {
            classes.push("text-foreground/90");
          }
          if (isBold) {
            classes.push("font-semibold");
          }
          currentClassName = classes.join(" ");
        }
        // Non-m command codes (like K, J, etc.) are discarded in this viewer to keep the log output clean and pretty.
      }
    }
    
    return elements;
  };

  const columns = [
    ["결정", packet.decisions],
    ["제약", packet.constraints],
    ["구현", packet.implementationPlan],
    ["검증", packet.verificationPlan],
  ] as const;

  return (
    <section className="coding-packet flex flex-col h-full bg-card/40 backdrop-blur-md border border-border/40 rounded-xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Coding Packet</span>
          <h2 className="text-lg font-bold text-foreground mt-0.5">{packet.goal}</h2>
        </div>
        <button 
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40" 
          type="button"
          onClick={handleVerifyClick}
          disabled={isVerifying || !onVerify}
        >
          {isVerifying ? (
            <Loader2 className="animate-spin h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success" />
          )}
          {isVerifying ? "검증 중..." : "구조 검증"}
        </button>
      </header>

      {/* Verification Checks & Live Terminal Console */}
      {verifier && (
        <div className="rounded-lg border border-border bg-card/30 p-3 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-border/40 pb-2">
            <span className="font-semibold text-foreground">패킷 검증 보고서</span>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-mono uppercase",
              verifier.status === "passed" && "bg-success/15 text-success border border-success/30",
              verifier.status === "warning" && "bg-warning/15 text-warning border border-warning/30",
              (verifier.status === "failed" || verifier.status === "blocked") && "bg-destructive/15 text-destructive border border-destructive/30"
            )}>
              {verifier.status}
            </span>
          </div>

          <div className="flex flex-wrap gap-3 py-1">
            {verifier.checks.map((check) => (
              <div className="flex items-center gap-1.5 text-xs" key={check.label}>
                {check.status === "pass" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : check.status === "warn" ? (
                  <AlertCircle className="h-4 w-4 text-warning" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-muted-foreground">{check.label}</span>
              </div>
            ))}
          </div>

          {/* Expandable ANSI Console Logs */}
          {(verifier.stdout || verifier.stderr) && (
            <div className="space-y-2">
              <button
                onClick={() => setShowConsole(!showConsole)}
                className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                type="button"
              >
                {showConsole ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showConsole ? "실시간 콘솔 닫기" : "실시간 콘솔 열기"}
              </button>

              {showConsole && (
                <div className="rounded-md border border-border/60 bg-black/90 p-3 font-mono text-[11px] text-foreground/90 shadow-inner">
                  <div className="flex items-center justify-between border-b border-border/30 pb-2 mb-2">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Verification Live Console (exitCode: {verifier.exitCode ?? 0})
                    </span>
                    <span className={cn(
                      "h-2 w-2 rounded-full",
                      verifier.status === "passed" ? "bg-success animate-pulse" : verifier.status === "warning" ? "bg-warning" : "bg-destructive animate-pulse"
                    )} />
                  </div>
                  <pre className="whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto pr-2 scrollbar-thin">
                    {formatConsoleLogs(verifier.stdout || verifier.stderr)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <section className="review-insight-panel grid grid-cols-2 gap-4" aria-label="Review and insight controls">
        <div className="review-mode-toggle flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Review Mode</span>
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-background/50">
            {(["quick", "deep"] as ReviewMode[]).map((mode) => (
              <button
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-all",
                  reviewMode === mode ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                )}
                key={mode}
                onClick={() => onReviewModeChange(mode)}
                type="button"
              >
                {reviewModeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
        <div className="rubric-chip-list flex flex-wrap gap-1 items-center justify-end">
          {["plan_coverage", "code_quality", "test_coverage", "convention", "invariant_checks"].map((rubric) => (
            <span className="rounded bg-muted/40 border border-border/40 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground" key={rubric}>{rubric}</span>
          ))}
        </div>
      </section>

      <div className="insight-chip-list flex flex-wrap gap-1 py-1">
        {insightFindings.slice(0, 6).map((finding) => (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] border",
            finding.status === "ok" && "bg-success/15 border-success/30 text-success",
            finding.status === "watch" && "bg-warning/15 border-warning/30 text-warning",
            finding.status === "quick_win" && "bg-primary/15 border-primary/30 text-primary"
          )} key={finding.id}>
            {insightCategoryLabel(finding.category)}: {finding.label}
          </span>
        ))}
      </div>

      <div className="packet-grid grid grid-cols-4 gap-3 flex-1 min-h-0 overflow-y-auto">
        {columns.map(([title, items]) => (
          <div className="packet-column border border-border/40 bg-card/10 rounded-lg p-2.5 space-y-1.5 flex flex-col" key={title}>
            <strong className="text-xs font-semibold text-foreground border-b border-border/30 pb-1">{title}</strong>
            <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4 overflow-y-auto max-h-[140px]">
              {items.map((item) => (
                <li key={item} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

