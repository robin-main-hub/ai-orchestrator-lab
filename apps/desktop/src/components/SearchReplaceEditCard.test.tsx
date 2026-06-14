// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchReplaceEditCard } from "./SearchReplaceEditCard";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";

afterEach(() => cleanup());

function file(path: string, content: string): MissionScaffoldFile {
  return { path, newContent: content };
}

const APPLY_OK = async () => ({
  outcome: "recorded" as const,
  overlay: {
    id: "ov_x",
    missionId: "m",
    source: "manual" as const,
    files: [{ path: "a.ts", content: "y" }],
    truthStatus: "planned" as const,
    createdAt: "t",
  },
});

describe("SearchReplaceEditCard — OSS-H4 bridge UI", () => {
  it("(E1) files=undefined → disabled 상태 + 정직 안내", () => {
    render(
      <SearchReplaceEditCard
        missionId="m1"
        files={undefined}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByTestId("search-replace-edit-m1").getAttribute("data-state")).toBe("disabled");
    expect(screen.getByTestId("search-replace-edit-disabled-m1")).toBeTruthy();
    expect(
      (screen.getByTestId("search-replace-edit-textarea-m1") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    expect((screen.getByTestId("search-replace-edit-apply-m1") as HTMLButtonElement).disabled).toBe(true);
  });

  it("(E2) 텍스트 입력 → 미리보기 카드 + 적용 1개 배지", () => {
    render(
      <SearchReplaceEditCard
        missionId="m2"
        files={[file("a.ts", "const x = 1;\n")]}
        onApply={vi.fn()}
      />,
    );
    const textarea = screen.getByTestId("search-replace-edit-textarea-m2");
    fireEvent.change(textarea, {
      target: {
        value: `a.ts
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE`,
      },
    });
    expect(screen.getByTestId("search-replace-edit-m2").getAttribute("data-state")).toBe("preview");
    expect(screen.getByTestId("search-replace-edit-stats-applied-m2").textContent).toContain("1");
    expect(screen.getByTestId("search-replace-edit-block-m2-0").getAttribute("data-result")).toBe("applied");
  });

  it("(E3) Apply 클릭 → onApply가 overlayFiles로 호출되고 'recorded' 메시지 표시", async () => {
    const onApply = vi.fn<(files: ReadonlyArray<{ path: string; content: string }>) => Promise<any>>(
      APPLY_OK as never,
    );
    render(
      <SearchReplaceEditCard
        missionId="m3"
        files={[file("a.ts", "old\n")]}
        onApply={onApply}
      />,
    );
    fireEvent.change(screen.getByTestId("search-replace-edit-textarea-m3"), {
      target: {
        value: `a.ts
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`,
      },
    });
    fireEvent.click(screen.getByTestId("search-replace-edit-apply-m3"));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    expect(onApply.mock.calls[0]![0]).toEqual([{ path: "a.ts", content: "new\n" }]);
    await waitFor(() => {
      expect(screen.getByTestId("search-replace-edit-applied-m3")).toBeTruthy();
    });
  });

  it("(E4) 매칭 실패 블록 → 실패 배지 + Apply 버튼 비활성화(overlayFiles=0)", () => {
    render(
      <SearchReplaceEditCard
        missionId="m4"
        files={[file("a.ts", "alpha\nbeta\n")]}
        onApply={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("search-replace-edit-textarea-m4"), {
      target: {
        value: `a.ts
<<<<<<< SEARCH
not-in-file
=======
X
>>>>>>> REPLACE`,
      },
    });
    expect(screen.getByTestId("search-replace-edit-stats-failed-m4").textContent).toContain("1");
    expect((screen.getByTestId("search-replace-edit-apply-m4") as HTMLButtonElement).disabled).toBe(true);
  });

  it("(E5) 가드 차단(시크릿) → gate 배지 + Apply 버튼 비활성화 + 사유 노출", () => {
    render(
      <SearchReplaceEditCard
        missionId="m5"
        files={[file(".env", "API=PLACEHOLDER\n")]}
        onApply={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("search-replace-edit-textarea-m5"), {
      target: {
        value: `.env
<<<<<<< SEARCH
API=PLACEHOLDER
=======
API=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA
>>>>>>> REPLACE`,
      },
    });
    expect(screen.getByTestId("search-replace-edit-stats-gate-m5").textContent).toContain("1");
    expect((screen.getByTestId("search-replace-edit-apply-m5") as HTMLButtonElement).disabled).toBe(true);
  });

  it("(E6) shadcn primitive 사용 확인 — data-slot 노출", () => {
    const { container } = render(
      <SearchReplaceEditCard missionId="m6" files={[file("a.ts", "x")]} onApply={vi.fn()} />,
    );
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-header"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-content"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="button"]')).toBeTruthy();
  });
});
