// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreviewAnnotatePanel } from "./PreviewAnnotatePanel";
import type { PreviewAnnotation } from "../lib/previewAnnotations";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";

afterEach(() => cleanup());

function file(path: string, content = ""): MissionScaffoldFile {
  return { path, newContent: content };
}

function ann(over: Partial<PreviewAnnotation> = {}): PreviewAnnotation {
  return {
    id: over.id ?? "a1",
    description: over.description ?? "헤더 글씨 작다",
    positionHint: over.positionHint,
    targetFile: over.targetFile,
    coords: over.coords,
    createdAt: over.createdAt ?? "2026-06-15T00:00:00Z",
  };
}

describe("PreviewAnnotatePanel — OSS-H7 text-only annotator", () => {
  it("(N1) 주석 0개 → empty 안내 + count=0", () => {
    render(
      <PreviewAnnotatePanel
        missionId="n1"
        files={undefined}
        annotations={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("preview-annotate-n1").getAttribute("data-count")).toBe("0");
    expect(screen.getByTestId("preview-annotate-empty-n1")).toBeTruthy();
    expect(screen.queryByTestId("preview-annotate-list-n1")).toBeNull();
  });

  it("(N2) description 비어 있으면 추가 버튼 비활성", () => {
    render(
      <PreviewAnnotatePanel
        missionId="n2"
        files={undefined}
        annotations={[]}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByTestId("preview-annotate-add-n2") as HTMLButtonElement).disabled).toBe(true);
  });

  it("(N3) description 입력 + 추가 → onChange가 annotation 1개와 호출", () => {
    const onChange = vi.fn();
    render(
      <PreviewAnnotatePanel
        missionId="n3"
        files={undefined}
        annotations={[]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("preview-annotate-description-n3"), {
      target: { value: "헤더 작다" },
    });
    fireEvent.change(screen.getByTestId("preview-annotate-position-n3"), {
      target: { value: "헤더" },
    });
    fireEvent.click(screen.getByTestId("preview-annotate-add-n3"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as PreviewAnnotation[];
    expect(next).toHaveLength(1);
    expect(next[0]!.description).toBe("헤더 작다");
    expect(next[0]!.positionHint).toBe("헤더");
  });

  it("(N4) files 있음 → targetFile select 노출 + 선택값이 annotation에 반영", () => {
    const onChange = vi.fn();
    render(
      <PreviewAnnotatePanel
        missionId="n4"
        files={[file("src/App.tsx"), file("src/styles.css")]}
        annotations={[]}
        onChange={onChange}
      />,
    );
    const sel = screen.getByTestId("preview-annotate-file-n4") as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    fireEvent.change(screen.getByTestId("preview-annotate-description-n4"), {
      target: { value: "primary action 약하다" },
    });
    fireEvent.change(sel, { target: { value: "src/App.tsx" } });
    fireEvent.click(screen.getByTestId("preview-annotate-add-n4"));
    const next = onChange.mock.calls[0]![0] as PreviewAnnotation[];
    expect(next[0]!.targetFile).toBe("src/App.tsx");
  });

  it("(N5) 주석 N개 → list 표시 + 각 item testid", () => {
    render(
      <PreviewAnnotatePanel
        missionId="n5"
        files={undefined}
        annotations={[ann({ id: "x1", positionHint: "헤더" }), ann({ id: "x2", description: "다른 문제" })]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("preview-annotate-n5").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("preview-annotate-list-n5")).toBeTruthy();
    expect(screen.getByTestId("preview-annotate-item-n5-x1")).toBeTruthy();
    expect(screen.getByTestId("preview-annotate-item-n5-x2")).toBeTruthy();
  });

  it("(N6) remove 버튼 클릭 → onChange가 그 항목 제외한 새 리스트로 호출", () => {
    const onChange = vi.fn();
    render(
      <PreviewAnnotatePanel
        missionId="n6"
        files={undefined}
        annotations={[ann({ id: "x1" }), ann({ id: "x2", description: "다른" })]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("preview-annotate-remove-n6-x1"));
    const next = onChange.mock.calls[0]![0] as PreviewAnnotation[];
    expect(next.map((a) => a.id)).toEqual(["x2"]);
  });

  it("(N8 — H7 P2) pendingCoords 들어옴 → 알림 박스 노출 + add 시 annotation에 coords 합쳐짐", () => {
    const onChange = vi.fn();
    const onClearPendingCoords = vi.fn();
    render(
      <PreviewAnnotatePanel
        missionId="n8"
        files={undefined}
        annotations={[]}
        onChange={onChange}
        pendingCoords={{ xPct: 23.4, yPct: 14.1 }}
        onClearPendingCoords={onClearPendingCoords}
      />,
    );
    const pending = screen.getByTestId("preview-annotate-pending-coords-n8");
    expect(pending.textContent).toContain("23.4");
    expect(pending.textContent).toContain("14.1");
    fireEvent.change(screen.getByTestId("preview-annotate-description-n8"), {
      target: { value: "여기 글씨가 작다" },
    });
    fireEvent.click(screen.getByTestId("preview-annotate-add-n8"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as PreviewAnnotation[];
    expect(next).toHaveLength(1);
    expect(next[0]!.coords).toEqual({ xPct: 23.4, yPct: 14.1 });
    expect(onClearPendingCoords).toHaveBeenCalled();
  });

  it("(N9 — H7 P2) '버리기' → onClearPendingCoords 호출", () => {
    const onClearPendingCoords = vi.fn();
    render(
      <PreviewAnnotatePanel
        missionId="n9"
        files={undefined}
        annotations={[]}
        onChange={vi.fn()}
        pendingCoords={{ xPct: 10, yPct: 20 }}
        onClearPendingCoords={onClearPendingCoords}
      />,
    );
    fireEvent.click(screen.getByTestId("preview-annotate-discard-coords-n9"));
    expect(onClearPendingCoords).toHaveBeenCalledTimes(1);
  });

  it("(N10 — H7 P2) coords 있는 기존 annotation은 리스트에 좌표 배지 표시", () => {
    render(
      <PreviewAnnotatePanel
        missionId="n10"
        files={undefined}
        annotations={[ann({ id: "x1", coords: { xPct: 80, yPct: 5 } })]}
        onChange={vi.fn()}
      />,
    );
    const badge = screen.getByTestId("preview-annotate-item-coords-n10-x1");
    expect(badge.textContent).toContain("80");
    expect(badge.textContent).toContain("5");
  });

  it("(N7) shadcn primitive 사용 확인", () => {
    const { container } = render(
      <PreviewAnnotatePanel
        missionId="n7"
        files={undefined}
        annotations={[]}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-header"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-content"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="badge"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="button"]')).toBeTruthy();
  });
});
