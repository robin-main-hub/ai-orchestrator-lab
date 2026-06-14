// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GeneratedFilesPanel } from "./GeneratedFilesPanel";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";

afterEach(() => cleanup());

function file(path: string, content = "", operation?: "create" | "update"): MissionScaffoldFile {
  return { path, newContent: content, operation };
}

describe("GeneratedFilesPanel — read-only inspector (OSS-H3)", () => {
  it("(P1) files=undefined → 'absent' 상태 + 정직 안내(가짜 트리 X)", () => {
    render(<GeneratedFilesPanel missionId="m1" files={undefined} />);
    expect(screen.getByTestId("generated-files-m1").getAttribute("data-state")).toBe("absent");
    expect(screen.getByTestId("generated-files-empty-m1")).toBeTruthy();
    expect(screen.queryByTestId("generated-files-tree-m1")).toBeNull();
  });

  it("(P2) 안전 파일 1개 → total/safe 배지 + 기본 선택 + 내용 표시", () => {
    render(
      <GeneratedFilesPanel
        missionId="m2"
        files={[file("README.md", "# Hello\nWorld\n")]}
      />,
    );
    const root = screen.getByTestId("generated-files-m2");
    expect(root.getAttribute("data-state")).toBe("present");
    expect(root.getAttribute("data-total")).toBe("1");
    expect(root.getAttribute("data-safe")).toBe("1");
    expect(screen.getByTestId("generated-files-total-m2").textContent).toContain("1");
    expect(screen.getByTestId("generated-files-safe-m2").textContent).toContain("1");
    expect(screen.queryByTestId("generated-files-blocked-m2")).toBeNull();
    // 기본 선택된 파일의 내용이 미리보기에 보인다
    const body = screen.getByTestId("generated-files-preview-body-m2");
    expect(body.textContent).toContain("Hello");
    expect(body.textContent).toContain("World");
  });

  it("(P3) 중첩 경로 → 디렉토리 토글 + 자식 leaf 클릭 시 미리보기 전환", () => {
    render(
      <GeneratedFilesPanel
        missionId="m3"
        files={[
          file("src/App.tsx", "export const App = () => null;\n"),
          file("src/util.ts", "export const x = 1;\n"),
          file("README.md", "# r\n"),
        ]}
      />,
    );
    // 디렉토리 노드가 존재
    expect(screen.getByTestId("generated-files-dir-m3-src")).toBeTruthy();
    // 기본 선택은 첫 안전 파일 — src/App.tsx
    expect(screen.getByTestId("generated-files-preview-path-m3").textContent).toBe("src/App.tsx");
    // 다른 leaf 클릭 → 미리보기 전환
    fireEvent.click(screen.getByTestId("generated-files-leaf-m3-src/util.ts"));
    expect(screen.getByTestId("generated-files-preview-path-m3").textContent).toBe("src/util.ts");
    // 디렉토리 접기 → 트리에서 자식이 사라지진 않더라도 aria-expanded=false
    fireEvent.click(screen.getByTestId("generated-files-dir-toggle-m3-src"));
    expect(screen.getByTestId("generated-files-dir-toggle-m3-src").getAttribute("aria-expanded"))
      .toBe("false");
  });

  it("(P4) gate 실패 파일은 사유 배지를 노출(정직성: secret_suspect / binary)", () => {
    render(
      <GeneratedFilesPanel
        missionId="m4"
        files={[
          file(".env", "API=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA\n"),
          file("bin.dat", "\0\0"),
          file("good.ts", "ok\n"),
        ]}
      />,
    );
    const root = screen.getByTestId("generated-files-m4");
    expect(root.getAttribute("data-total")).toBe("3");
    expect(root.getAttribute("data-safe")).toBe("1");
    expect(screen.getByTestId("generated-files-blocked-m4").textContent).toContain("2");

    const env = screen.getByTestId("generated-files-leaf-m4-.env");
    expect(env.getAttribute("data-gate")).toBe("secret_suspect");
    expect(screen.getByTestId("generated-files-leaf-gate-m4-.env").textContent).toContain("시크릿");

    const bin = screen.getByTestId("generated-files-leaf-m4-bin.dat");
    expect(bin.getAttribute("data-gate")).toBe("binary");
  });

  it("(P5) MAX_PREVIEW_LINES 초과 → 잘려서 표시되고 '+ N 줄 더 있음' 안내", () => {
    const big = Array.from({ length: 250 }, (_, i) => `line ${i}`).join("\n");
    render(<GeneratedFilesPanel missionId="m5" files={[file("big.txt", big)]} />);
    const truncated = screen.getByTestId("generated-files-preview-truncated-m5");
    expect(truncated.textContent).toContain("50");
  });

  it("(P6) operation 'create'/'update' 배지가 leaf에 표시된다", () => {
    render(
      <GeneratedFilesPanel
        missionId="m6"
        files={[file("a.ts", "x", "create"), file("b.ts", "y", "update")]}
      />,
    );
    const a = screen.getByTestId("generated-files-leaf-m6-a.ts");
    const b = screen.getByTestId("generated-files-leaf-m6-b.ts");
    expect(a.textContent).toContain("create");
    expect(b.textContent).toContain("update");
  });

  it("(P7) shadcn primitive 사용 확인 — data-slot=card/card-header/card-content/badge", () => {
    const { container } = render(
      <GeneratedFilesPanel missionId="m7" files={[file("a.ts", "x")]} />,
    );
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-header"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-content"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="badge"]')).toBeTruthy();
  });
});
