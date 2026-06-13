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

function reactViteScaffold(appName: string): ScaffoldFile[] {
  const name = (appName || "app").replace(/[^a-z0-9-_]/gi, "-").toLowerCase() || "app";
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
    { path: "index.html", content: `<!doctype html>\n<html lang="ko">\n  <head><meta charset="utf-8" /><title>${name}</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>\n` },
    { path: "src/main.tsx", content: `import { createRoot } from "react-dom/client";\nimport { App } from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n` },
    { path: "src/App.tsx", content: `export function App() {\n  return (\n    <main>\n      <h1>${name}</h1>\n      <button type="button">시작하기</button>\n    </main>\n  );\n}\n` },
    { path: "README.md", content: `# ${name}\n\nReact + Vite 앱 스캐폴드.\n\n- dev: \`pnpm dev\`\n- build: \`pnpm build\`\n- preview: \`pnpm preview\`\n` },
  ];
}

/** 템플릿 id + 입력 → 스캐폴드 파일들(순수, 회사 도메인 0). */
export function scaffoldForTemplate(templateId: string, input: Record<string, string | number>): ScaffoldFile[] {
  if (templateId === "react_vite_app") {
    return reactViteScaffold(String(input.appName ?? "app"));
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
