import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * 앱 전역 에러 경계 — 렌더 중 던져진 예외가 전체 화면을 흰 화면으로 날리는 대신,
 * 복구 가능한 카드로 잡아낸다. 정식 프로그램이 갖춰야 할 최소 안전장치.
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 콘솔에 남겨 디버깅/리포트에 쓰이게 한다
    console.error("[AppErrorBoundary] 렌더 중 예외:", error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0b] p-6 text-zinc-100">
        <div className="w-full max-w-md rounded-2xl border border-rose-300/25 bg-rose-500/[0.06] p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-300/30 bg-rose-400/10 text-2xl">
            ⚠
          </div>
          <h1 className="mt-4 text-base font-semibold">화면을 그리다 문제가 생겼어요</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">
            예상치 못한 오류로 이 화면이 멈췄습니다. 새로고침하면 대부분 복구됩니다. 작업 기록(세션·이벤트)은
            저장돼 있어 사라지지 않습니다.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-black/40 p-2 text-left font-mono text-[10.5px] leading-relaxed text-rose-200/80">
            {error.message}
          </pre>
          <div className="mt-4 flex justify-center gap-2">
            <button
              className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-4 py-2 text-[12.5px] font-semibold text-rose-100 hover:bg-rose-400/20"
              onClick={this.handleReload}
              type="button"
            >
              새로고침
            </button>
            <button
              className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[12.5px] text-zinc-300 hover:bg-white/[0.08]"
              onClick={this.handleDismiss}
              type="button"
            >
              그냥 닫기
            </button>
          </div>
        </div>
      </div>
    );
  }
}
