import { z } from "zod";
import { truthStatusSchema } from "./truthStatus.js";

/**
 * Generic Template scaffold/diff (D7) — Template→Mission이 문서로만 끝나지 않고 실제 파일
 * scaffold까지 이어진다. 단 **즉시 덮어쓰기 금지**: plan(쓰기 없음) → 기존 파일 overwrite는
 * approval, 적용 전 checkpoint, 새 파일은 생성.
 *
 * 정직성:
 *   - plan은 **planned**(아직 쓰지 않음 — 무엇이 생성/덮어쓰기될지 보여줄 뿐).
 *   - apply는 **observed**(실제 파일 기록) — 단 checkpoint 후 + overwrite는 approval일 때만.
 *   - 회사 도메인 0 — generic 앱/디자인 스캐폴드만.
 *
 * scaffold.ts는 zod/truthStatus만 import(productKernel이 record 필드로 import해도 순환 없음).
 * 실제 파일 IO는 서버 scaffoldRunner가 한다 — 여기는 순수 데이터/계획.
 */

export type ScaffoldFile = { path: string; content: string };

/**
 * scaffoldForTemplate 입력에 블루프린트 의도를 동승시키기 위한 minimal spec.
 * DesignBlueprint 전체 schema를 import하지 않는 이유: scaffold.ts는 zod/truthStatus만
 * import하는 leaf 모듈로 유지(순환 import 위험 0). 그래서 호출자가 필요한 필드만 추려서 넘긴다.
 */
export type ScaffoldBlueprintSpec = {
  userIntent: string;
  screens: Array<{ name: string; purpose: string; primaryAction: string }>;
  acceptanceCriteria: string[];
};

/** App.tsx/README/JSX 안에서 안전하게 텍스트를 표시하기 위한 최소 escape. */
function jsxText(text: string): string {
  return (text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}
function htmlText(text: string): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function mdText(text: string): string {
  return (text ?? "").replace(/[\r\n]+/g, " ").trim();
}

/**
 * "__blueprint" JSON 인코딩된 형태로 templateInput에 실려온 블루프린트를 복원한다.
 * 디코딩 실패 시 undefined — fallback은 placeholder app(원래 동작).
 */
function decodeBlueprintFromInput(input: Record<string, string | number>): ScaffoldBlueprintSpec | undefined {
  const raw = input.__blueprint;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<ScaffoldBlueprintSpec>;
    if (!parsed || typeof parsed !== "object") return undefined;
    const screens = Array.isArray(parsed.screens)
      ? parsed.screens
          .filter((s) => s && typeof s === "object")
          .map((s) => ({
            name: typeof s.name === "string" ? s.name : "",
            purpose: typeof s.purpose === "string" ? s.purpose : "",
            primaryAction: typeof s.primaryAction === "string" ? s.primaryAction : "",
          }))
      : [];
    const criteria = Array.isArray(parsed.acceptanceCriteria)
      ? parsed.acceptanceCriteria.filter((c): c is string => typeof c === "string")
      : [];
    return {
      userIntent: typeof parsed.userIntent === "string" ? parsed.userIntent : "",
      screens,
      acceptanceCriteria: criteria,
    };
  } catch {
    return undefined;
  }
}

/**
 * blueprint를 templateInput에 안전하게 동승시킨다. scaffoldPlan.input은 Record<string,string|number>
 * 라서 JSON 문자열로 인코딩 — schema 변경 0. seedBlueprintScaffold가 사용.
 */
export function encodeBlueprintToScaffoldInput(blueprint: ScaffoldBlueprintSpec): Record<string, string | number> {
  return { __blueprint: JSON.stringify(blueprint) };
}

function reactViteScaffold(appName: string, blueprint?: ScaffoldBlueprintSpec): ScaffoldFile[] {
  const name = (appName || "app").replace(/[^a-z0-9-_]/gi, "-").toLowerCase() || "app";
  const intent = blueprint?.userIntent?.trim() ?? "";
  const screens = blueprint?.screens ?? [];
  const criteria = blueprint?.acceptanceCriteria ?? [];

  const intentHero = intent
    ? `      <header className="app-hero">\n        <h1>${jsxText(name)}</h1>\n        <p className="app-hero__intent">${jsxText(intent)}</p>\n      </header>`
    : `      <header className="app-hero"><h1>${jsxText(name)}</h1></header>`;

  const screenCards = screens.length > 0
    ? `      <section className="app-screens" aria-label="screens">\n${screens
        .map((s) => `        <article className="screen-card">\n          <h2>${jsxText(s.name || "(screen)")}</h2>\n          <p className="screen-card__purpose">${jsxText(s.purpose || "")}</p>\n          <button type="button" className="screen-card__action">${jsxText(s.primaryAction || "시작")}</button>\n        </article>`)
        .join("\n")}\n      </section>`
    : `      <section className="app-screens" aria-label="screens"><p className="screen-card__purpose">아직 등록된 화면이 없습니다.</p></section>`;

  const appTsx = `import "./styles.css";\n\nexport function App() {\n  return (\n    <main className="app-shell">\n${intentHero}\n${screenCards}\n    </main>\n  );\n}\n`;

  const indexTitle = htmlText(name);
  const stylesCss = `:root {\n  color-scheme: light dark;\n  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;\n}\n\nbody {\n  margin: 0;\n  background: #0f1115;\n  color: #e6e8ee;\n}\n\n.app-shell {\n  min-height: 100vh;\n  padding: 2.5rem 1.5rem;\n  max-width: 960px;\n  margin: 0 auto;\n  display: flex;\n  flex-direction: column;\n  gap: 2rem;\n}\n\n.app-hero h1 {\n  margin: 0 0 0.5rem 0;\n  font-size: 1.8rem;\n  letter-spacing: -0.01em;\n}\n\n.app-hero__intent {\n  margin: 0;\n  color: #aab0bc;\n  font-size: 1rem;\n  line-height: 1.5;\n  max-width: 60ch;\n}\n\n.app-screens {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));\n  gap: 1rem;\n}\n\n.screen-card {\n  background: #181b22;\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  border-radius: 0.75rem;\n  padding: 1.25rem;\n  display: flex;\n  flex-direction: column;\n  gap: 0.5rem;\n}\n\n.screen-card h2 {\n  margin: 0;\n  font-size: 1.1rem;\n}\n\n.screen-card__purpose {\n  margin: 0;\n  color: #aab0bc;\n  font-size: 0.9rem;\n  line-height: 1.4;\n  flex: 1;\n}\n\n.screen-card__action {\n  align-self: flex-start;\n  background: #2c8cff;\n  color: white;\n  border: none;\n  border-radius: 0.5rem;\n  padding: 0.5rem 0.85rem;\n  font-weight: 600;\n  cursor: pointer;\n}\n.screen-card__action:hover { filter: brightness(1.1); }\n`;

  const readmeIntent = intent ? `## 의도\n\n${mdText(intent)}\n\n` : "";
  const readmeScreens = screens.length > 0
    ? `## 화면\n\n${screens.map((s) => `- **${mdText(s.name) || "(screen)"}** — ${mdText(s.purpose) || ""}${s.primaryAction ? ` _(주요 액션: ${mdText(s.primaryAction)})_` : ""}`).join("\n")}\n\n`
    : "";
  const readmeCriteria = criteria.length > 0
    ? `## 수용 기준\n\n${criteria.map((c) => `- [ ] ${mdText(c)}`).join("\n")}\n\n`
    : "";
  const readme = `# ${name}\n\nReact + Vite 앱 스캐폴드. Blueprint에서 자동 생성됨.\n\n${readmeIntent}${readmeScreens}${readmeCriteria}## 개발\n\n- dev: \`pnpm dev\`\n- build: \`pnpm build\`\n- preview: \`pnpm preview\`\n`;

  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name,
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
          dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
          devDependencies: { "@vitejs/plugin-react": "^4.3.1", typescript: "^5.5.0", vite: "^5.4.0" },
        },
        null,
        2,
      ),
    },
    { path: "index.html", content: `<!doctype html>\n<html lang="ko">\n  <head><meta charset="utf-8" /><title>${indexTitle}</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>\n` },
    { path: "src/main.tsx", content: `import { createRoot } from "react-dom/client";\nimport { App } from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n` },
    { path: "src/App.tsx", content: appTsx },
    { path: "src/styles.css", content: stylesCss },
    { path: "README.md", content: readme },
  ];
}

/** 템플릿 id + 입력 → 스캐폴드 파일들(순수, 회사 도메인 0).
 *  입력에 __blueprint(JSON 인코딩된 ScaffoldBlueprintSpec)가 있으면 App.tsx/README/CSS에 의도 반영. */
export function scaffoldForTemplate(templateId: string, input: Record<string, string | number>): ScaffoldFile[] {
  const blueprint = decodeBlueprintFromInput(input);
  if (templateId === "react_vite_app") {
    return reactViteScaffold(String(input.appName ?? "app"), blueprint);
  }
  // 그 외 generic 템플릿 — README + 컴포넌트 스텁(주요 액션/빈·오류 상태 자리표시)
  const title = String(input.title ?? input.name ?? templateId);
  const component = templateId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return [
    { path: "README.md", content: `# ${title}\n\n${templateId} 스캐폴드(초안). 화면/주요 액션/빈 상태/오류 상태를 구현하세요.\n` },
    {
      path: `src/${component}.tsx`,
      content: `export function ${component}() {\n  // TODO: ${title} — 주요 액션 / 빈 상태 / 오류 상태\n  return (\n    <section aria-label="${title}">\n      <h2>${title}</h2>\n      <button type="button">주요 액션</button>\n    </section>\n  );\n}\n`,
    },
  ];
}

export const scaffoldPlanFileSchema = z.object({
  path: z.string(),
  action: z.enum(["create", "overwrite"]),
  bytes: z.number().int(),
  contentPreview: z.string(),
});
export type ScaffoldPlanFile = z.infer<typeof scaffoldPlanFileSchema>;

export const scaffoldApplyResultSchema = z.object({
  status: z.enum(["applied", "blocked", "failed"]),
  appliedPaths: z.array(z.string()).default([]),
  checkpointSha: z.string().optional(),
  reason: z.string(),
  observed: z.boolean(),
  appliedAt: z.string(),
});
export type ScaffoldApplyResult = z.infer<typeof scaffoldApplyResultSchema>;

export const scaffoldPlanSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  templateId: z.string(),
  /** apply 시 content 재생성을 위한 스캐폴드 입력(결정적) */
  input: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  repoRootRef: z.string(),
  files: z.array(scaffoldPlanFileSchema),
  hasOverwrites: z.boolean(),
  truthStatus: truthStatusSchema,
  createdAt: z.string(),
  /** apply 후 채워짐 */
  apply: scaffoldApplyResultSchema.optional(),
});
export type ScaffoldPlan = z.infer<typeof scaffoldPlanSchema>;

const PREVIEW_LIMIT = 280;

/**
 * 스캐폴드 파일 + 기존 경로 집합 → ScaffoldPlan(순수). action은 existingPaths로 결정.
 * planned(아직 쓰지 않음). 실제 존재 확인/쓰기는 서버.
 */
export function buildScaffoldPlan(input: {
  id: string;
  missionId: string;
  workspaceId: string;
  templateId: string;
  templateInput: Record<string, string | number>;
  repoRootRef: string;
  scaffold: ScaffoldFile[];
  existingPaths: ReadonlySet<string>;
  now: () => string;
}): ScaffoldPlan {
  const files: ScaffoldPlanFile[] = input.scaffold.map((file) => ({
    path: file.path,
    action: input.existingPaths.has(file.path) ? "overwrite" : "create",
    bytes: Buffer.byteLength(file.content, "utf8"),
    contentPreview: file.content.length > PREVIEW_LIMIT ? `${file.content.slice(0, PREVIEW_LIMIT - 1)}…` : file.content,
  }));
  return {
    id: input.id,
    missionId: input.missionId,
    workspaceId: input.workspaceId,
    templateId: input.templateId,
    input: input.templateInput,
    repoRootRef: input.repoRootRef,
    files,
    hasOverwrites: files.some((file) => file.action === "overwrite"),
    truthStatus: "planned", // 아직 쓰지 않음
    createdAt: input.now(),
  };
}

export const missionScaffoldPlannedPayloadSchema = z.object({ missionId: z.string(), plan: scaffoldPlanSchema });
export type MissionScaffoldPlannedPayload = z.infer<typeof missionScaffoldPlannedPayloadSchema>;

export const missionScaffoldAppliedPayloadSchema = z.object({
  missionId: z.string(),
  planId: z.string(),
  result: scaffoldApplyResultSchema,
});
export type MissionScaffoldAppliedPayload = z.infer<typeof missionScaffoldAppliedPayloadSchema>;

export const scaffoldPlanRequestSchema = z.object({
  templateId: z.string().min(1).max(128),
  input: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});
export type ScaffoldPlanRequest = z.infer<typeof scaffoldPlanRequestSchema>;

export const scaffoldApplyRequestSchema = z.object({
  planId: z.string().min(1).max(256),
  /** overwrite가 있는 plan을 적용하려면 grant된 approvalId가 필요 */
  approvalId: z.string().max(256).optional(),
});
export type ScaffoldApplyRequest = z.infer<typeof scaffoldApplyRequestSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// GET /missions/:id/scaffold/latest — Publish Flow prefill의 truth source.
// 정직성:
//   - status="found"는 mission record에 plan이 있고 그 templateId+input으로
//     scaffoldForTemplate을 재호출해서 path+content가 실제로 재현된 경우만.
//   - "not_found"는 mission은 존재하지만 scaffold plan이 없는 경우.
//   - "partial"은 일부 파일이 가드(binary/too_large/secret_suspect/missing_content)에
//     걸려 제외된 경우(safeFiles + skipped 둘 다 채워짐).
//   - truthStatus는 plan의 그것을 따른다("planned"가 일반적; GitHub에 쓰인 결과는 아님).
// ──────────────────────────────────────────────────────────────────────────────

export const missionScaffoldLatestSafeFileSchema = z.object({
  path: z.string(),
  /** UTF-8 텍스트 — bounded(서버 가드 통과분만). 추측 금지: scaffoldForTemplate 재생성 결과 그대로. */
  content: z.string(),
  /** 어떤 출처에서 왔는지 표시 — 사용자가 "정말 plan에서 온 거구나"를 알 수 있게. */
  source: z.enum(["scaffold_plan"]),
  /** 해당 scaffold plan record의 createdAt(plan 시점 — observed 시점이 아님). */
  createdAt: z.string(),
});
export type MissionScaffoldLatestSafeFile = z.infer<typeof missionScaffoldLatestSafeFileSchema>;

export const missionScaffoldLatestSkippedReasonSchema = z.enum([
  /** plan에서 path만 있고 본문 재생성이 빈 문자열 — 정직하게 제외. */
  "missing_content",
  /** NUL byte 포함 — binary로 간주, 텍스트 PR로 못 보냄. */
  "binary",
  /** 256 KiB 이상 — W3a 한도와 동일, 분할 plan 필요. */
  "too_large",
  /** ghp_ / sk-ant- / PEM 등 — 외부 GitHub로 절대 보내면 안 됨. */
  "secret_suspect",
  /** templateId가 지원되지 않거나 input이 비정상 — scaffoldForTemplate가 빈 배열. */
  "unsupported",
]);
export type MissionScaffoldLatestSkippedReason = z.infer<typeof missionScaffoldLatestSkippedReasonSchema>;

export const missionScaffoldLatestSkippedSchema = z.object({
  /** path를 알 수 있는 경우 표시(unsupported 같은 경우 비어 있을 수 있음). */
  path: z.string().optional(),
  reason: missionScaffoldLatestSkippedReasonSchema,
});
export type MissionScaffoldLatestSkipped = z.infer<typeof missionScaffoldLatestSkippedSchema>;

export const missionScaffoldLatestResponseSchema = z.object({
  missionId: z.string(),
  status: z.enum(["found", "not_found", "partial", "blocked"]),
  truthStatus: truthStatusSchema,
  /** 가드 통과한 안전 파일들(빈 배열 가능). */
  files: z.array(missionScaffoldLatestSafeFileSchema),
  /** 가드에 걸려 제외된 항목들 — 사용자가 "왜 빠졌는지" 알 수 있게. */
  skipped: z.array(missionScaffoldLatestSkippedSchema),
  /** plan이 여러 개면 어떤 plan을 골랐는지(보통 가장 마지막). */
  planId: z.string().optional(),
  /** 진단용 메시지(예: "mission not found", "scaffold plan 없음"). */
  message: z.string().optional(),
});
export type MissionScaffoldLatestResponse = z.infer<typeof missionScaffoldLatestResponseSchema>;
