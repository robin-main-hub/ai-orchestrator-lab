import { useState, useEffect } from "react";
import { Lock, Unlock, Clock, AlertTriangle, ShieldCheck, RefreshCw, X } from "lucide-react";
import { resolveDgxServerBaseUrls } from "../runtime/stage30DgxEndpoints";
import { cn } from "@/lib/utils";

type LockInfo = {
  slot: string;
  lockOwner: string | null;
  lockUntil: string | null;
  tokenVersion: number | null;
  clockSkewMs: number | null;
  updatedAt: string | null;
};

export type ClusterLocksDashboardProps = {
  open: boolean;
  onClose: () => void;
};

export function ClusterLocksDashboard({ open, onClose }: ClusterLocksDashboardProps) {
  const [locks, setLocks] = useState<LockInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const baseUrls = resolveDgxServerBaseUrls();
      const primaryUrl = baseUrls[0] || "http://localhost:4317";
      const response = await fetch(`${primaryUrl}/api/cluster-locks`);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      const data = await response.json();
      setLocks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLocks();
      const interval = setInterval(fetchLocks, 3000);
      return () => clearInterval(interval);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-border/40 bg-card/90 backdrop-blur-md shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/20 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <Lock className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Notion Lock & WAL Cluster Dashboard</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                SQLite 분산 락, 토큰 버전 번호 및 프로세스 liveness 상태를 실시간 모니터링합니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLocks}
              className="p-1.5 rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              title="새로고침"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>락 서버 조회 오류: {error}</span>
          </div>
        )}

        {/* Main List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {locks.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border/10 rounded-lg bg-muted/5">
              <Unlock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <span className="text-xs text-muted-foreground">활성화된 클러스터 락 데이터가 없습니다.</span>
            </div>
          ) : (
            locks.map((lock) => {
              const isLocked = !!(lock.lockOwner && lock.lockUntil && new Date(lock.lockUntil) > new Date());
              const lockUntilTime = lock.lockUntil ? new Date(lock.lockUntil) : null;
              const remainingMs = lockUntilTime ? lockUntilTime.getTime() - Date.now() : 0;
              const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
              
              // Lease Progress Bar percent (assume max lease of 15 seconds)
              const maxLease = 15;
              const percent = Math.min(100, Math.max(0, (remainingSec / maxLease) * 100));

              return (
                <div
                  key={lock.slot}
                  className={cn(
                    "rounded-lg border p-4 transition-all hover:bg-card/50",
                    isLocked ? "border-primary/20 bg-primary/[0.02]" : "border-border/30 bg-muted/[0.02]"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/20">
                          {lock.slot}
                        </span>
                        {isLocked ? (
                          <span className="flex items-center gap-1 text-[9px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full uppercase">
                            <Lock className="h-2.5 w-2.5" /> Locked
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-semibold text-muted-foreground bg-muted border border-border/20 px-1.5 py-0.5 rounded-full uppercase">
                            <Unlock className="h-2.5 w-2.5" /> Idle / Released
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        <span className="font-semibold text-muted-foreground/80">소유자:</span>{" "}
                        <span className="font-mono">{lock.lockOwner || "없음"}</span>
                      </div>
                    </div>

                    <div className="text-right text-[10px] space-y-0.5 font-mono">
                      <div className="text-muted-foreground">
                        버전: <span className="text-foreground font-semibold">{lock.tokenVersion ?? 0}</span>
                      </div>
                      {lock.clockSkewMs !== null && (
                        <div className={cn(
                          Math.abs(lock.clockSkewMs) > 1000 ? "text-warning" : "text-muted-foreground"
                        )}>
                          클락 스큐: <span className="font-semibold">{lock.clockSkewMs}ms</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lease progress bar if locked */}
                  {isLocked && (
                    <div className="mt-3.5 space-y-1">
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                        <span>남은 임대(Lease) 시간</span>
                        <span>{remainingSec}s / 15s</span>
                      </div>
                      <div className="w-full h-1 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-1000 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-2.5 pt-2 border-t border-border/10 flex items-center justify-between text-[9px] text-muted-foreground/60 font-mono">
                    <span>최종 갱신: {lock.updatedAt ? new Date(lock.updatedAt).toLocaleTimeString() : "-"}</span>
                    <span>만료: {lock.lockUntil ? new Date(lock.lockUntil).toLocaleTimeString() : "-"}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border/20 flex items-center justify-between text-[9px] text-muted-foreground font-mono">
          <span>WAL Mode: PRAGMA journal_mode = WAL</span>
          <span>Cluster Active · Sync OK</span>
        </div>
      </div>
    </div>
  );
}
