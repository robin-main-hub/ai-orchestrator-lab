// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  isValidUserView,
  readUserViews,
  removeUserView,
  slugifyViewName,
  upsertUserView,
  writeUserViews,
  type UserSavedView,
} from "./userSavedViews";

const KEY = "ai-orchestrator.inbox-saved-views.v1";
afterEach(() => localStorage.clear());

const view = (name: string, over: Partial<UserSavedView> = {}): UserSavedView => ({
  id: slugifyViewName(name),
  name,
  mode: "live",
  focus: "all",
  category: "all",
  search: "",
  ...over,
});

describe("Batch 12 — LINE B: user saved views (local UI pref, pure)", () => {
  it("slugifies names deterministically and never empty", () => {
    expect(slugifyViewName("My Desk")).toBe("my-desk");
    expect(slugifyViewName("  ")).toBe("view");
    expect(slugifyViewName("실패만")).toBe("실패만");
  });

  it("upsert overwrites by id (same name) and keeps newest first", () => {
    let list = upsertUserView([], view("My Desk", { focus: "today" }));
    list = upsertUserView(list, view("Failures", { category: "failure" }));
    list = upsertUserView(list, view("My Desk", { focus: "blocked" })); // overwrite
    expect(list.map((v) => v.id)).toEqual(["my-desk", "failures"]);
    expect(list.find((v) => v.id === "my-desk")!.focus).toBe("blocked");
  });

  it("remove drops by id; read round-trips through localStorage", () => {
    const list = upsertUserView(upsertUserView([], view("a")), view("b"));
    writeUserViews(list);
    expect(readUserViews().map((v) => v.id).sort()).toEqual(["a", "b"]);
    writeUserViews(removeUserView(list, "a"));
    expect(readUserViews().map((v) => v.id)).toEqual(["b"]);
  });

  it("ignores invalid stored views (bad mode/focus/category/missing name)", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        view("ok"),
        { id: "x", name: "", mode: "live", focus: "all", category: "all", search: "" }, // empty name
        { id: "y", name: "y", mode: "bogus", focus: "all", category: "all", search: "" }, // bad mode
        { id: "z", name: "z", mode: "live", focus: "all", category: "nope", search: "" }, // bad category
      ]),
    );
    expect(readUserViews().map((v) => v.id)).toEqual(["ok"]);
    expect(isValidUserView({ name: "n" })).toBe(false);
  });
});
