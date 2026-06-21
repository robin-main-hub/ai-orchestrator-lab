import { describe, expect, it } from "vitest";
import {
  buildScaffoldPlan,
  encodeBlueprintToScaffoldInput,
  missionScaffoldLatestResponseSchema,
  missionScaffoldLatestSafeFileSchema,
  missionScaffoldLatestSkippedReasonSchema,
  missionScaffoldLatestSkippedSchema,
  missionScaffoldOverlayRecordedPayloadSchema,
  missionScaffoldOverlayRequestSchema,
  missionScaffoldOverlayResponseSchema,
  scaffoldForTemplate,
  scaffoldOverlayFileSchema,
  scaffoldOverlaySchema,
  scaffoldOverlaySourceSchema,
  scaffoldPlanSchema,
  type ScaffoldBlueprintSpec,
} from "./scaffold.js";

const now = () => "2026-06-13T00:00:00.000Z";

describe("scaffoldForTemplate", () => {
  it("react_vite_app produces a real minimal Vite scaffold (no company strings)", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "demo" });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("index.html");
    const blob = JSON.stringify(files);
    for (const banned of ["example-domain", "EXAMPLE_DOMAIN", "HTV", "견적"]) expect(blob).not.toContain(banned);
  });

  it("a generic template produces a README + component stub", () => {
    const files = scaffoldForTemplate("dashboard_screen", { title: "보드" });
    expect(files.some((f) => f.path === "README.md")).toBe(true);
    expect(files.some((f) => f.path.startsWith("src/") && f.path.endsWith(".tsx"))).toBe(true);
  });
});

// encodeBlueprintToScaffoldInput is the 0-ref encoder that smuggles a blueprint
// through scaffoldPlan.input (a Record<string, string|number>) under the
// "__blueprint" JSON key — schema-change-free. The decode side is private, only
// reachable via scaffoldForTemplate. Pin the encode shape and the full
// round-trip (intent + screens + acceptance criteria reflected into App.tsx /
// README), plus the honest fallback to a placeholder app when the blueprint is
// absent or malformed (never a half-rendered fake). Generic todo app — no domain.
describe("encodeBlueprintToScaffoldInput — blueprint round-trip", () => {
  const blueprint: ScaffoldBlueprintSpec = {
    userIntent: "할 일을 한 곳에서 관리한다",
    screens: [
      { name: "목록", purpose: "오늘 할 일을 본다", primaryAction: "완료 표시" },
      { name: "추가", purpose: "새 할 일을 적는다", primaryAction: "저장" },
    ],
    acceptanceCriteria: ["빈 목록일 때 안내를 보여준다", "추가 후 목록이 갱신된다"],
  };

  it("encodes to a single __blueprint JSON key that parses back to the same spec", () => {
    const encoded = encodeBlueprintToScaffoldInput(blueprint);
    expect(Object.keys(encoded)).toEqual(["__blueprint"]);
    expect(JSON.parse(String(encoded.__blueprint))).toEqual(blueprint);
  });

  it("reflects the encoded intent / screens / acceptance criteria into the react_vite scaffold", () => {
    const encoded = encodeBlueprintToScaffoldInput(blueprint);
    const files = scaffoldForTemplate("react_vite_app", { appName: "todo", ...encoded });
    const appTsx = files.find((f) => f.path === "src/App.tsx")!.content;
    const readme = files.find((f) => f.path === "README.md")!.content;
    for (const fragment of ["할 일을 한 곳에서 관리한다", "목록", "오늘 할 일을 본다", "완료 표시", "추가", "저장"]) {
      expect(appTsx).toContain(fragment);
    }
    expect(readme).toContain("## 의도");
    expect(readme).toContain("## 화면");
    expect(readme).toContain("## 수용 기준");
    expect(readme).toContain("빈 목록일 때 안내를 보여준다");
  });

  it("falls back to the placeholder app when no __blueprint is present", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "todo" });
    const appTsx = files.find((f) => f.path === "src/App.tsx")!.content;
    const readme = files.find((f) => f.path === "README.md")!.content;
    expect(appTsx).toContain("아직 등록된 화면이 없습니다.");
    expect(readme).not.toContain("## 의도");
  });

  it("falls back gracefully when __blueprint is malformed JSON (no throw, placeholder app)", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "todo", __blueprint: "{not valid json" });
    const appTsx = files.find((f) => f.path === "src/App.tsx")!.content;
    expect(appTsx).toContain("아직 등록된 화면이 없습니다.");
  });
});

// The generic (non-react_vite) branch of scaffoldForTemplate is only checked
// for "a README + some src/*.tsx exists" above — its title fallback chain
// (title → name → templateId), the PascalCase component-name derivation from
// the templateId, and the actual stub content (h2/aria-label/주요 액션 button)
// are all unpinned. And buildScaffoldPlan is only exercised with a pre-existing
// path (overwrite=true); the all-create / hasOverwrites:false path, the 280-char
// contentPreview clipping, and the utf8 byte counting never fire. Pin them,
// self-consistent (derived from the templateId / the content we feed in).
describe("scaffoldForTemplate — generic branch title fallback + component derivation", () => {
  it("derives a PascalCase component from the templateId and falls back title→name→templateId", () => {
    // neither title nor name → title IS the templateId
    const bare = scaffoldForTemplate("kanban_board", {});
    const comp = bare.find((f) => f.path.startsWith("src/"))!;
    expect(comp.path).toBe("src/KanbanBoard.tsx"); // kanban_board → KanbanBoard
    expect(comp.content).toContain("export function KanbanBoard()");
    expect(comp.content).toContain('aria-label="kanban_board"'); // title === templateId
    expect(comp.content).toContain("<h2>kanban_board</h2>");
    expect(comp.content).toContain("주요 액션"); // the stub action button
    expect(bare.find((f) => f.path === "README.md")!.content).toContain("# kanban_board");
  });

  it("uses input.name when title is absent (component still comes from the templateId, not the name)", () => {
    const files = scaffoldForTemplate("foo_bar", { name: "이름" });
    const comp = files.find((f) => f.path.startsWith("src/"))!;
    expect(comp.path).toBe("src/FooBar.tsx"); // component from templateId
    expect(comp.content).toContain("<h2>이름</h2>"); // title from input.name
    expect(files.find((f) => f.path === "README.md")!.content).toContain("# 이름");
  });
});

describe("buildScaffoldPlan — all-create path, preview clipping, utf8 byte counting", () => {
  it("with no existingPaths every file is create and hasOverwrites is false", () => {
    const plan = buildScaffoldPlan({
      id: "sc2",
      missionId: "m1",
      workspaceId: "ws1",
      templateId: "react_vite_app",
      templateInput: {},
      repoRootRef: "/repo",
      scaffold: [
        { path: "a.txt", content: "alpha" },
        { path: "b.txt", content: "beta" },
      ],
      existingPaths: new Set<string>(),
      now,
    });
    expect(plan.files.every((f) => f.action === "create")).toBe(true);
    expect(plan.hasOverwrites).toBe(false);
  });

  it("clips contentPreview to 280 chars with an ellipsis only past the limit, and counts utf8 bytes", () => {
    const long = "x".repeat(400);
    const han = "가".repeat(10); // 10 chars, 30 utf8 bytes
    const plan = buildScaffoldPlan({
      id: "sc3",
      missionId: "m1",
      workspaceId: "ws1",
      templateId: "react_vite_app",
      templateInput: {},
      repoRootRef: "/repo",
      scaffold: [
        { path: "long.txt", content: long },
        { path: "han.txt", content: han },
      ],
      existingPaths: new Set<string>(),
      now,
    });
    const longFile = plan.files.find((f) => f.path === "long.txt")!;
    expect(longFile.contentPreview.length).toBe(280); // 279 chars + the … glyph
    expect(longFile.contentPreview.endsWith("…")).toBe(true);
    expect(longFile.contentPreview.slice(0, 279)).toBe(long.slice(0, 279));
    expect(longFile.bytes).toBe(400); // ascii — one byte each

    const hanFile = plan.files.find((f) => f.path === "han.txt")!;
    expect(hanFile.contentPreview).toBe(han); // 10 ≤ 280 → verbatim, no ellipsis
    expect(hanFile.bytes).toBe(30); // 3 utf8 bytes per hangul syllable
  });
});

describe("buildScaffoldPlan", () => {
  it("marks create vs overwrite, stays planned, carries input for later apply", () => {
    const scaffold = scaffoldForTemplate("react_vite_app", { appName: "demo" });
    const plan = buildScaffoldPlan({
      id: "sc1",
      missionId: "m1",
      workspaceId: "ws1",
      templateId: "react_vite_app",
      templateInput: { appName: "demo" },
      repoRootRef: "/repo",
      scaffold,
      existingPaths: new Set(["package.json"]),
      now,
    });
    expect(() => scaffoldPlanSchema.parse(plan)).not.toThrow();
    expect(plan.truthStatus).toBe("planned"); // 아직 쓰지 않음
    expect(plan.hasOverwrites).toBe(true);
    expect(plan.input.appName).toBe("demo"); // apply 재생성용
    expect(plan.files.find((f) => f.path === "package.json")?.action).toBe("overwrite");
  });
});

// The react_vite scaffold sanitizes appName into a safe project identifier
// (scaffold.ts:89 — replace [^a-z0-9-_] with "-", lowercase, fall back to "app").
// Every test above feeds an already-safe lowercase name ("demo"/"todo"), so the
// sanitizer is unpinned — yet this raw user string lands in the package.json
// `name` and the README/HTML title, so an unsanitized space/symbol or uppercase
// would produce a broken (or unsafe) project id. Pin: lowercasing, non-id char
// runs → "-", digit/hyphen/underscore preserved, empty/omitted → "app", and that
// the SAME sanitized name flows into package.json + README (no divergent copies).
describe("scaffoldForTemplate(react_vite_app) — appName sanitized to a safe project id", () => {
  const pkgName = (appName?: string): string => {
    const input: Record<string, string | number> = appName === undefined ? {} : { appName };
    const files = scaffoldForTemplate("react_vite_app", input);
    return JSON.parse(files.find((f) => f.path === "package.json")!.content).name as string;
  };

  it("lowercases and collapses non-identifier chars to '-'", () => {
    expect(pkgName("Demo App")).toBe("demo-app"); // space → '-', uppercase → lower
    expect(pkgName("a@b.c")).toBe("a-b-c"); // each symbol → '-'
    expect(pkgName("MyApp")).toBe("myapp");
  });

  it("preserves digits, hyphen and underscore (already valid id chars)", () => {
    expect(pkgName("my_app-2")).toBe("my_app-2");
  });

  it("falls back to 'app' when appName is empty or omitted", () => {
    expect(pkgName("")).toBe("app");
    expect(pkgName(undefined)).toBe("app");
  });

  it("flows the SAME sanitized name into the README title (no divergent copy)", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "Demo App" });
    const readme = files.find((f) => f.path === "README.md")!.content;
    expect(readme).toContain("# demo-app"); // README header uses the sanitized name
    const name = JSON.parse(files.find((f) => f.path === "package.json")!.content).name;
    expect(readme.startsWith(`# ${name}`)).toBe(true); // identical to the package id
  });
});

// GET /missions/:id/scaffold/latest is the truth source for the Publish Flow
// prefill — the files it returns are what gets sent to external GitHub. Its
// safety contract is deny-by-default: every plan file is classified as either a
// SAFE file (verbatim deterministic regeneration, never guessed) or a SKIPPED
// item carrying a CLOSED, NAMED reason — nothing is silently dropped, and the
// secret_suspect reason exists precisely to stop a credential leaving for GitHub.
// The four schemas in this cluster were entirely unreferenced; pin them
// self-consistently (derived from the schema's own declared shape).
describe("scaffold/latest — deny-by-default safe-vs-skipped file safety contract", () => {
  it("a safe file needs all four fields and a provenance source from the closed 2-value enum", () => {
    const ok = { path: "src/App.tsx", content: "x", source: "scaffold_plan" as const, createdAt: now() };
    expect(missionScaffoldLatestSafeFileSchema.safeParse(ok).success).toBe(true);
    // every field is mandatory — none may be omitted
    for (const k of ["path", "content", "source", "createdAt"]) {
      const { [k]: _omit, ...partial } = ok as Record<string, unknown>;
      expect(missionScaffoldLatestSafeFileSchema.safeParse(partial).success).toBe(false);
    }
    // source is exactly {scaffold_plan, scaffold_overlay} — no other provenance
    expect(missionScaffoldLatestSafeFileSchema.shape.source.options).toEqual(["scaffold_plan", "scaffold_overlay"]);
    expect(missionScaffoldLatestSafeFileSchema.safeParse({ ...ok, source: "uploaded" }).success).toBe(false);
    // a smuggled extra key is stripped (plain z.object)
    const parsed = missionScaffoldLatestSafeFileSchema.parse({ ...ok, raw: "secret" });
    expect("raw" in parsed).toBe(false);
  });

  it("the skipped-reason enum is exactly the five guard outcomes (secret_suspect among them)", () => {
    expect(missionScaffoldLatestSkippedReasonSchema.options).toEqual([
      "missing_content",
      "binary",
      "too_large",
      "secret_suspect",
      "unsupported",
    ]);
    // secret_suspect is the deny-before-external-send guard — it must be a member
    expect(missionScaffoldLatestSkippedReasonSchema.options).toContain("secret_suspect");
    expect(missionScaffoldLatestSkippedReasonSchema.safeParse("looks_fine").success).toBe(false);
  });

  it("a skipped item must name a reason; path is optional (e.g. unsupported has no path)", () => {
    expect(missionScaffoldLatestSkippedSchema.safeParse({ reason: "unsupported" }).success).toBe(true);
    const withPath = missionScaffoldLatestSkippedSchema.parse({ path: "a.bin", reason: "binary" });
    expect(withPath.path).toBe("a.bin");
    // reason is required — a path with no reason is not a valid skip
    expect(missionScaffoldLatestSkippedSchema.safeParse({ path: "a.bin" }).success).toBe(false);
  });

  it("the response REQUIRES both files[] and skipped[] (no default) — the skipped list can't be omitted to hide drops", () => {
    const base = {
      missionId: "m1",
      status: "partial" as const,
      truthStatus: "planned" as const,
      files: [{ path: "src/App.tsx", content: "x", source: "scaffold_plan" as const, createdAt: now() }],
      skipped: [{ path: "logo.png", reason: "binary" as const }],
    };
    const parsed = missionScaffoldLatestResponseSchema.parse(base);
    expect(parsed.planId).toBeUndefined(); // optional diagnostics never fabricated
    expect(parsed.message).toBeUndefined();
    // status is exactly the four lifecycle states
    expect(missionScaffoldLatestResponseSchema.shape.status.options).toEqual([
      "found",
      "not_found",
      "partial",
      "blocked",
    ]);
    // omitting skipped[] (or files[]) fails — both arrays must be stated, even when empty
    const { skipped: _s, ...noSkipped } = base;
    const { files: _f, ...noFiles } = base;
    expect(missionScaffoldLatestResponseSchema.safeParse(noSkipped).success).toBe(false);
    expect(missionScaffoldLatestResponseSchema.safeParse(noFiles).success).toBe(false);
    // an empty-but-present skipped list is honest and valid
    expect(missionScaffoldLatestResponseSchema.safeParse({ ...base, skipped: [] }).success).toBe(true);
    // transitive: a skipped entry with a reason outside the closed enum sinks the response
    expect(
      missionScaffoldLatestResponseSchema.safeParse({ ...base, skipped: [{ path: "a", reason: "meh" }] }).success,
    ).toBe(false);
  });
});

// Scaffold overlay = a user-CONFIRMED file replacement (Visual QA AppFix / manual
// edit) layered over the deterministic scaffold base. It is privileged — it
// overwrites base files that will later be published — so its contract is worth
// pinning: each overlay file is bounded (path/content size caps), the source is a
// closed 2-value provenance enum, the persisted RECORD must carry ≥1 file (an
// empty overlay is meaningless → rejected) up to 32 and must state its source
// explicitly, while the inbound REQUEST may DEFAULT source→appfix (the common
// path) — an asymmetry that keeps the audited record honest. The response is an
// honest 3-outcome envelope that fabricates no overlay on the non-success paths.
// Whole cluster was unreferenced; pin self-consistently (derived from the schema).
describe("scaffold overlay — bounded privileged file replacement: record requires source, request defaults it", () => {
  const file = { path: "src/App.tsx", content: "x" };
  const record = {
    id: "ov1",
    missionId: "m1",
    source: "appfix" as const,
    files: [file],
    truthStatus: "planned" as const,
    createdAt: now(),
  };

  it("an overlay file is bounded (path 1..512, content ≤ 256 KiB) and source is the closed {appfix, manual} enum", () => {
    expect(scaffoldOverlayFileSchema.safeParse(file).success).toBe(true);
    expect(scaffoldOverlayFileSchema.safeParse({ path: "", content: "x" }).success).toBe(false); // path min 1
    expect(scaffoldOverlayFileSchema.safeParse({ path: "a".repeat(513), content: "x" }).success).toBe(false); // path max 512
    expect(scaffoldOverlayFileSchema.safeParse({ path: "a", content: "x".repeat(256 * 1024 + 1) }).success).toBe(false);
    expect(scaffoldOverlayFileSchema.safeParse({ path: "a", content: "x".repeat(256 * 1024) }).success).toBe(true); // exactly at the cap
    expect(scaffoldOverlaySourceSchema.options).toEqual(["appfix", "manual"]);
    expect(scaffoldOverlaySourceSchema.safeParse("uploaded").success).toBe(false);
  });

  it("the persisted record requires ≥1 file (caps at 32), names its source explicitly, and never fabricates evidenceRef", () => {
    const parsed = scaffoldOverlaySchema.parse(record);
    expect(parsed.evidenceRef).toBeUndefined(); // optional audit ref, not fabricated
    // an empty overlay is meaningless → rejected; 32 ok, 33 over the cap
    expect(scaffoldOverlaySchema.safeParse({ ...record, files: [] }).success).toBe(false);
    const mk = (n: number) => Array.from({ length: n }, (_v, i) => ({ path: `f${i}`, content: "x" }));
    expect(scaffoldOverlaySchema.safeParse({ ...record, files: mk(32) }).success).toBe(true);
    expect(scaffoldOverlaySchema.safeParse({ ...record, files: mk(33) }).success).toBe(false);
    // the record (unlike the request) has NO default for source — it must be stated
    const { source: _s, ...noSource } = record;
    expect(scaffoldOverlaySchema.safeParse(noSource).success).toBe(false);
  });

  it("the inbound request DEFAULTS source→appfix (asymmetry vs the record) and keeps the same 1..32 file bound", () => {
    const parsed = missionScaffoldOverlayRequestSchema.parse({ files: [file] });
    expect(parsed.source).toBe("appfix"); // defaulted, not required
    expect(parsed.evidenceRef).toBeUndefined();
    expect(missionScaffoldOverlayRequestSchema.safeParse({ files: [] }).success).toBe(false); // still ≥1
    const mk = (n: number) => Array.from({ length: n }, (_v, i) => ({ path: `f${i}`, content: "x" }));
    expect(missionScaffoldOverlayRequestSchema.safeParse({ files: mk(33) }).success).toBe(false);
    // a manual source is still accepted explicitly
    expect(missionScaffoldOverlayRequestSchema.parse({ source: "manual", files: [file] }).source).toBe("manual");
  });

  it("the response is an honest 3-outcome envelope: overlay only on success, nothing fabricated on blocked/not_found", () => {
    expect(missionScaffoldOverlayResponseSchema.shape.outcome.options).toEqual([
      "recorded",
      "blocked",
      "mission_not_found",
    ]);
    // success carries the overlay record
    const okParsed = missionScaffoldOverlayResponseSchema.parse({ outcome: "recorded", overlay: record });
    expect(okParsed.overlay?.id).toBe("ov1");
    // non-success paths carry no overlay and fabricate nothing
    const blocked = missionScaffoldOverlayResponseSchema.parse({
      outcome: "blocked",
      skipped: [{ path: "logo.png", reason: "binary" }],
    });
    expect(blocked.overlay).toBeUndefined();
    const notFound = missionScaffoldOverlayResponseSchema.parse({ outcome: "mission_not_found" });
    expect(notFound.overlay).toBeUndefined();
    expect(notFound.skipped).toBeUndefined();
    expect(notFound.message).toBeUndefined();
    // recorded payload embeds the overlay transitively — a broken embed sinks it
    expect(missionScaffoldOverlayRecordedPayloadSchema.safeParse({ missionId: "m1", overlay: record }).success).toBe(true);
    expect(
      missionScaffoldOverlayRecordedPayloadSchema.safeParse({ missionId: "m1", overlay: { ...record, files: [] } })
        .success,
    ).toBe(false);
  });
});
