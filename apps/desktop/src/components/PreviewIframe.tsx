import { useEffect, useRef, useState } from "react";
import { ExternalLink, RotateCw, MousePointerClick, MousePointer } from "lucide-react";

/**
 * Preview iframe — observed preview URL을 우리 UI 안에 안전하게 박는다.
 *
 *   - sandbox="allow-scripts allow-same-origin allow-forms" — top navigation /
 *     popup / pointer-lock 차단. dev preview는 보통 React 앱이라 scripts는 필수.
 *   - referrerPolicy="no-referrer" — 외부에 우리 페이지 URL 누설 X.
 *   - X-Frame-Options/CSP로 차단되면 onError가 아니라 빈 화면이 그려진다.
 *     이를 정직하게 알리기 위해 일정 시간(loadTimeoutMs) 후 load 이벤트가 안 오면
 *     "차단된 것 같다" 라벨을 노출하고 외부 링크를 권장한다.
 *   - 자동 reload / 자동 navigation 0 — refresh 버튼은 사용자 클릭 시에만.
 *
 * 가짜 성공 표시 0 — load 실패와 "빈 페이지" 사이를 사용자가 구분할 수 있게.
 */

const DEFAULT_LOAD_TIMEOUT_MS = 4000;

export function PreviewIframe({
  url,
  testIdPrefix,
  height = 480,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  onAnnotate,
}: {
  url: string;
  /** 호출자별 unique 접두어. "preview-iframe-{prefix}-..." 로 testid 생성. */
  testIdPrefix: string;
  /** 픽셀 단위 높이. 기본 480px. */
  height?: number;
  /** load 이벤트 대기 시간 — 이 이상이면 "차단된 듯" 라벨 노출. */
  loadTimeoutMs?: number;
  /** OSS-H7: 주석 모드 활성 시 클릭 좌표(0~100%) callback. 미제공이면 토글 자체가 노출 X. */
  onAnnotate?: (point: { xPct: number; yPct: number }) => void;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [version, setVersion] = useState(0);
  const [annotateMode, setAnnotateMode] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    const handle = window.setTimeout(() => {
      // load가 안 들어왔으면 timed_out 상태 — 사용자에게 "차단된 것 같다"고 알린다.
      setTimedOut((prev) => prev || !loaded);
    }, loadTimeoutMs);
    return () => window.clearTimeout(handle);
    // url/version 바뀌면 다시 시도. loaded는 의존성에 넣지 않음(타이머가 매 load마다 재시작되지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, version, loadTimeoutMs]);

  const onReload = () => setVersion((v) => v + 1);

  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onAnnotate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // 소수점 1자리로 반올림 — makeAnnotation 측 clampPct와 같은 단위. 부동소수점 노이즈를 가장자리에서 정리.
    const xPct = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const yPct = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    onAnnotate({ xPct, yPct });
    setAnnotateMode(false); // 한 번 클릭하면 모드 해제 — 부모가 description 입력으로 유도하게.
  };

  return (
    <div
      className="preview-iframe"
      data-testid={`preview-iframe-${testIdPrefix}`}
      data-state={loaded ? "loaded" : timedOut ? "timed_out" : "loading"}
    >
      <div className="preview-iframe__head flex items-center gap-2 text-xs">
        <code className="text-muted-foreground" data-testid={`preview-iframe-url-${testIdPrefix}`}>
          {url}
        </code>
        <button
          type="button"
          onClick={onReload}
          className="ml-auto inline-flex items-center gap-1 rounded-md border bg-input/40 px-2 py-0.5 hover:bg-input"
          data-testid={`preview-iframe-reload-${testIdPrefix}`}
          aria-label="iframe 다시 로드"
        >
          <RotateCw size={10} /> 다시 로드
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border bg-input/40 px-2 py-0.5 hover:bg-input"
          data-testid={`preview-iframe-open-${testIdPrefix}`}
        >
          새 탭 <ExternalLink size={10} />
        </a>
        {onAnnotate ? (
          <button
            type="button"
            onClick={() => setAnnotateMode((v) => !v)}
            aria-pressed={annotateMode}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
              annotateMode
                ? "border-violet-400/40 bg-violet-500/20 text-violet-100"
                : "bg-input/40 hover:bg-input"
            }`}
            data-testid={`preview-iframe-annotate-toggle-${testIdPrefix}`}
            title="주석 모드: iframe 위 클릭하면 좌표(%)가 캡처됩니다. DOM 접근 0(cross-origin 안전)."
          >
            {annotateMode ? <MousePointerClick size={10} /> : <MousePointer size={10} />}
            {annotateMode ? "주석 모드(클릭하세요)" : "주석 모드"}
          </button>
        ) : null}
      </div>

      <div className="preview-iframe__frame-wrap" style={{ position: "relative" }}>
      <iframe
        key={version}
        ref={ref}
        src={url}
        title={`Preview ${testIdPrefix}`}
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{ width: "100%", height: `${height}px`, border: 0, background: "#0a0a0b" }}
        data-testid={`preview-iframe-frame-${testIdPrefix}`}
        onLoad={() => {
          setLoaded(true);
          setTimedOut(false);
        }}
      />
      {/* 주석 모드 overlay — pointer-events:auto가 iframe 클릭을 가로채 좌표 캡처 (DOM 접근 0). */}
      {onAnnotate && annotateMode ? (
        <div
          ref={overlayRef}
          onClick={onOverlayClick}
          data-testid={`preview-iframe-annotate-overlay-${testIdPrefix}`}
          aria-label="주석 모드 — iframe 위에서 클릭"
          style={{
            position: "absolute",
            inset: 0,
            cursor: "crosshair",
            background: "rgba(167, 139, 250, 0.06)",
            border: "1px dashed rgba(167, 139, 250, 0.45)",
          }}
        />
      ) : null}
      </div>

      {timedOut && !loaded ? (
        <p
          className="text-xs text-amber-400 mt-1"
          data-testid={`preview-iframe-blocked-${testIdPrefix}`}
        >
          iframe load 신호 없음 — preview 서버가 X-Frame-Options/CSP로 임베드를 차단할 수 있습니다.
          새 탭에서 열어 확인하세요.
        </p>
      ) : null}
    </div>
  );
}
