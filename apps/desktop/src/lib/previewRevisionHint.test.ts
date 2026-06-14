import { describe, expect, it } from "vitest";
import {
  buildPreviewRevisionHint,
  PREVIEW_REVISION_HINT_KIND_LABEL,
} from "./previewRevisionHint";

/**
 * preview 실패 → 수정 힌트 분류 — pure 모듈이므로 LLM/네트워크 없이 매칭만.
 * 정직성:
 *   - observed/no_scaffold/not_configured/mission_not_found는 hint를 만들지 않는다(undefined).
 *   - 분류 가능한 단서가 없으면 "unknown" — fake 진단 X.
 */

describe("buildPreviewRevisionHint", () => {
  it("observed → undefined(hint 불필요)", () => {
    expect(buildPreviewRevisionHint({ outcome: "observed" })).toBeUndefined();
  });
  it("no_scaffold → undefined", () => {
    expect(buildPreviewRevisionHint({ outcome: "no_scaffold" })).toBeUndefined();
  });
  it("not_configured → undefined", () => {
    expect(buildPreviewRevisionHint({ outcome: "not_configured" })).toBeUndefined();
  });

  it("materialize_failed + EACCES → 권한 단계가 맨 위에 노출", () => {
    const hint = buildPreviewRevisionHint({
      outcome: "materialize_failed",
      message: "writeFile failed: EACCES permission denied",
    });
    expect(hint?.kind).toBe("materialize");
    expect(hint?.steps[0]).toMatch(/권한 오류|EACCES/);
  });

  it("materialize_failed + ENOSPC → 디스크 공간 단계 노출", () => {
    const hint = buildPreviewRevisionHint({
      outcome: "materialize_failed",
      message: "ENOSPC: no space left on device",
    });
    expect(hint?.kind).toBe("materialize");
    expect(hint?.steps[0]).toMatch(/디스크 공간|ENOSPC/);
  });

  it("preview_not_running + spawn ENOENT → install_dependency", () => {
    const hint = buildPreviewRevisionHint({
      outcome: "preview_not_running",
      preview: { status: "failed", detail: "spawn pnpm ENOENT", truthStatus: "configured" },
    });
    expect(hint?.kind).toBe("install_dependency");
    expect(hint?.steps.some((s) => /pnpm install|npm install/.test(s))).toBe(true);
  });

  it("preview_not_running + Cannot find module → install_dependency", () => {
    const hint = buildPreviewRevisionHint({
      outcome: "preview_not_running",
      preview: { status: "failed", detail: "Error: Cannot find module 'react'" },
    });
    expect(hint?.kind).toBe("install_dependency");
  });

  it("preview_not_running + Vite SyntaxError → vite_startup", () => {
    const hint = buildPreviewRevisionHint({
      outcome: "preview_not_running",
      preview: { status: "failed", detail: "SyntaxError in src/App.tsx" },
    });
    expect(hint?.kind).toBe("vite_startup");
    expect(hint?.steps.some((s) => /App\.tsx|main\.tsx/.test(s))).toBe(true);
  });

  it("preview_not_running + EADDRINUSE → http_probe", () => {
    const hint = buildPreviewRevisionHint({
      outcome: "preview_not_running",
      preview: { status: "failed", detail: "listen EADDRINUSE: address already in use :::4567" },
    });
    expect(hint?.kind).toBe("http_probe");
    expect(hint?.steps.some((s) => /포트|EADDRINUSE/.test(s))).toBe(true);
  });

  it("preview_not_running + detail 없음 → http_probe(프로세스는 떴는데 포트 안 옴)로 추정", () => {
    const hint = buildPreviewRevisionHint({
      outcome: "preview_not_running",
      preview: { status: "failed" },
    });
    expect(hint?.kind).toBe("http_probe");
  });

  it("error outcome + 분류 단서 없음 → unknown(추측 금지)", () => {
    const hint = buildPreviewRevisionHint({ outcome: "error", message: "" });
    expect(hint?.kind).toBe("unknown");
    expect(hint?.summary).toMatch(/분류|로그/);
  });

  it("install signal이 더 우선이면 vite로 잘못 분류되지 않는다", () => {
    // 'main.tsx'와 'cannot find module'이 같이 있어도, install signal이 먼저 매치되어야 한다(우선순위 결정성).
    const hint = buildPreviewRevisionHint({
      outcome: "preview_not_running",
      preview: { status: "failed", detail: "src/main.tsx: Cannot find module 'react-dom/client'" },
    });
    expect(hint?.kind).toBe("install_dependency");
  });

  it("kind별 라벨 — UI 매핑 회귀", () => {
    expect(PREVIEW_REVISION_HINT_KIND_LABEL.install_dependency).toBe("의존성 설치");
    expect(PREVIEW_REVISION_HINT_KIND_LABEL.vite_startup).toBe("Vite 시작 실패");
    expect(PREVIEW_REVISION_HINT_KIND_LABEL.http_probe).toBe("포트 응답 없음");
    expect(PREVIEW_REVISION_HINT_KIND_LABEL.materialize).toBe("파일 풀기 실패");
    expect(PREVIEW_REVISION_HINT_KIND_LABEL.unknown).toBe("분류 불가");
  });
});
