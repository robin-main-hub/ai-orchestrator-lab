// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyUserSavedInboxView,
  isValidUserView,
  readUserViews,
  removeUserView,
  sanitizeSavedViewName,
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

  // Characterization tests (no behavior change) for the two previously-unasserted
  // exports of userSavedViews.ts: sanitizeSavedViewName and applyUserSavedInboxView.
  // The block above drives slugify / isValid / read / write / upsert / remove but
  // never these two.
  //
  // - sanitizeSavedViewName is the human-facing DISPLAY-name cleaner: it only trims,
  //   collapses internal whitespace runs to a single space, and caps at 48 chars.
  //   Its load-bearing contrast with slugifyViewName is that it PRESERVES case,
  //   Korean, and punctuation (slugify lowercases, dashes spaces, strips punctuation
  //   and returns the "view" sentinel on empty) — they are two different cleaners and
  //   must not be conflated. An all-whitespace name sanitizes to "" (the empty marker
  //   isValidUserView then rejects), NOT to a sentinel.
  // - applyUserSavedInboxView is the view-only command projection. Its load-bearing
  //   contract is that it surfaces ONLY the four view-state fields (mode/focus/
  //   category/search) under kind "applyView" and DROPS identity/metadata
  //   (id/name/schemaVersion) — and it is nonce-less (the caller attaches the nonce).
  //   Leaking id/name or a stale nonce here would corrupt the one-shot command.
  it("sanitizeSavedViewName trims, collapses internal whitespace, and preserves case/Korean/punctuation", () => {
    expect(sanitizeSavedViewName("  My   Desk  ")).toBe("My Desk");
    // tabs and newlines are whitespace too — collapsed to single spaces
    expect(sanitizeSavedViewName("\t실패\n\n만  보기 ")).toBe("실패 만 보기");
    // punctuation and case survive (this is NOT a slug)
    expect(sanitizeSavedViewName("Bug! #42 (urgent)")).toBe("Bug! #42 (urgent)");
    // all-whitespace sanitizes to "" (no "view" sentinel — that's slugify's job)
    expect(sanitizeSavedViewName("   ")).toBe("");
  });

  it("sanitizeSavedViewName caps the display name at 48 chars (after whitespace collapse)", () => {
    const long = "x".repeat(60);
    const out = sanitizeSavedViewName(long);
    expect(out).toHaveLength(48);
    expect(out).toBe("x".repeat(48));
  });

  it("sanitizeSavedViewName and slugifyViewName are distinct cleaners on the same input", () => {
    const raw = "  My   Desk!  ";
    expect(sanitizeSavedViewName(raw)).toBe("My Desk!"); // display: case/space/punct kept
    expect(slugifyViewName(raw)).toBe("my-desk"); // identity: lowercased, dashed, stripped
  });

  it("applyUserSavedInboxView projects only the four view-state fields under kind applyView", () => {
    const saved = view("Replay blockers", {
      mode: "replay",
      focus: "blocked",
      category: "failure",
      search: "needle",
      schemaVersion: 1,
    });
    const command = applyUserSavedInboxView(saved);
    expect(command).toEqual({
      kind: "applyView",
      view: { mode: "replay", focus: "blocked", category: "failure", search: "needle" },
    });
  });

  it("applyUserSavedInboxView is nonce-less and drops identity/metadata (id/name/schemaVersion)", () => {
    const command = applyUserSavedInboxView(view("My Desk"));
    // the caller attaches the incrementing nonce — the projection must not carry one
    expect("nonce" in command).toBe(false);
    expect(command.view).toBeDefined();
    const projected = command.view!;
    // identity/metadata never leak into the one-shot command payload
    expect("id" in projected).toBe(false);
    expect("name" in projected).toBe(false);
    expect("schemaVersion" in projected).toBe(false);
    expect(Object.keys(projected).sort()).toEqual(["category", "focus", "mode", "search"]);
  });

  it("the model imports no writer / runner / EventStorage / server / approval seam", () => {
    const rel = "src/lib/userSavedViews.ts";
    const path =
      [resolve(process.cwd(), rel), resolve(process.cwd(), "apps/desktop", rel)].find((p) =>
        existsSync(p),
      ) ?? resolve(process.cwd(), rel);
    const src = readFileSync(path, "utf8");
    for (const banned of [
      "executeLocalBatchWrite",
      "createLocalClientEventCache",
      "stage29LocalEventStore",
      "stage34ApprovalServer",
      "grantDgxApproval",
      "codingRunner",
      "routes/github",
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });
});
