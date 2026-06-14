// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TurboEditDraftCard } from "./TurboEditDraftCard";
import type { AppFixDraft } from "../lib/appFixDraft";
import type { MissionScaffoldFile } from "../lib/missionPublishPrefill";

afterEach(() => cleanup());

function file(path: string, content: string): MissionScaffoldFile {
  return { path, newContent: content };
}

const APP_FIX_DRAFT: AppFixDraft = {
  status: "has_fixes",
  summary: "이슈 1건",
  fileSuggestions: [
    {
      file: "src/App.tsx",
      what: "primary button 라벨 명확화",
      why: "주요 action이 약함",
      kindHints: ["missing_primary_action"],
      evidenceIssueIds: ["i1"],
    },
  ],
  unmappedIssues: [],
  counts: { totalIssues: 1, mappedIssues: 1, unmappedIssues: 0, suggestionGroups: 1 },
};

const VALID_OUTPUT = `src/App.tsx
<<<<<<< SEARCH
hello
=======
world
>>>>>>> REPLACE`;

describe("TurboEditDraftCard — OSS-H5 producer surface", () => {
  it("(T1) files=undefined → disabled + 정직 안내(가짜 prompt X)", () => {
    render(
      <TurboEditDraftCard
        missionId="t1"
        files={undefined}
        onSendDraft={vi.fn()}
      />,
    );
    expect(screen.getByTestId("turbo-edits-draft-t1").getAttribute("data-state")).toBe("disabled");
    expect(screen.getByTestId("turbo-edits-draft-disabled-t1")).toBeTruthy();
  });

  it("(T2) AppFixDraft 있음 → 초점 파일이 미리 선택되고 prompt에 suggestion 포함", () => {
    render(
      <TurboEditDraftCard
        missionId="t2"
        appName="테스트 앱"
        files={[file("src/App.tsx", "hello\n"), file("README.md", "# r\n")]}
        appFixDraft={APP_FIX_DRAFT}
        onSendDraft={vi.fn()}
      />,
    );
    const body = screen.getByTestId("turbo-edits-prompt-body-t2");
    expect(body.textContent).toContain("테스트 앱");
    expect(body.textContent).toContain("primary button 라벨 명확화");
    expect(body.textContent).toContain("src/App.tsx");
  });

  it("(T3) 사용자 instruction 입력 → prompt 본문에 들어간다", () => {
    render(
      <TurboEditDraftCard
        missionId="t3"
        files={[file("src/App.tsx", "x")]}
        onSendDraft={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("turbo-edits-instruction-t3"), {
      target: { value: "헤더 크게" },
    });
    expect(screen.getByTestId("turbo-edits-prompt-body-t3").textContent).toContain("헤더 크게");
  });

  it("(T4) 응답이 비정상(no_blocks) → '초안으로 보내기' 비활성 + 사유 노출", () => {
    render(
      <TurboEditDraftCard
        missionId="t4"
        files={[file("src/App.tsx", "x")]}
        onSendDraft={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("turbo-edits-paste-t4"), {
      target: { value: "just a chat reply" },
    });
    expect(screen.getByTestId("turbo-edits-validation-error-t4").getAttribute("data-reason"))
      .toBe("no_blocks");
    expect((screen.getByTestId("turbo-edits-send-t4") as HTMLButtonElement).disabled).toBe(true);
  });

  it("(T5) NO_CONFIDENT_EDITS → 정직한 'no edits' 안내 + send 비활성", () => {
    render(
      <TurboEditDraftCard
        missionId="t5"
        files={[file("src/App.tsx", "x")]}
        onSendDraft={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("turbo-edits-paste-t5"), {
      target: { value: "NO_CONFIDENT_EDITS\n" },
    });
    expect(screen.getByTestId("turbo-edits-validation-no-edits-t5")).toBeTruthy();
    expect((screen.getByTestId("turbo-edits-send-t5") as HTMLButtonElement).disabled).toBe(true);
  });

  it("(T6) valid 응답 → ok 라벨 + send 클릭하면 onSendDraft가 원문 텍스트로 호출", () => {
    const onSendDraft = vi.fn();
    render(
      <TurboEditDraftCard
        missionId="t6"
        files={[file("src/App.tsx", "hello\n")]}
        onSendDraft={onSendDraft}
      />,
    );
    fireEvent.change(screen.getByTestId("turbo-edits-paste-t6"), {
      target: { value: VALID_OUTPUT },
    });
    expect(screen.getByTestId("turbo-edits-validation-ok-t6").textContent).toContain("블록 1");
    fireEvent.click(screen.getByTestId("turbo-edits-send-t6"));
    expect(onSendDraft).toHaveBeenCalledWith(VALID_OUTPUT);
  });

  it("(T7) prompt 미리보기에 시크릿 파일 내용은 들어가지 않는다(가드)", () => {
    render(
      <TurboEditDraftCard
        missionId="t7"
        files={[file(".env", "API=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA\n"), file("src/App.tsx", "x")]}
        onSendDraft={vi.fn()}
      />,
    );
    // 기본 선택에 포함되도록 .env path 클릭
    fireEvent.click(screen.getByTestId("turbo-edits-path-t7-.env"));
    const body = screen.getByTestId("turbo-edits-prompt-body-t7");
    expect(body.textContent ?? "").not.toContain("ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  it("(T8) shadcn primitive 사용 확인", () => {
    const { container } = render(
      <TurboEditDraftCard
        missionId="t8"
        files={[file("a.ts", "x")]}
        onSendDraft={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-header"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-content"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="button"]')).toBeTruthy();
  });
});
