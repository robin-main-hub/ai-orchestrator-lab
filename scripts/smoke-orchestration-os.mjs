#!/usr/bin/env node
// @ts-check
/**
 * Product E2E smoke — Headless Hermes Board / Orchestration OS (Live Wiring L8).
 *
 * 단위 테스트(1000+개)와 별개로 "진짜 사용 루프"가 한 번에 깨지는지 보는 product smoke.
 * 자기 서버 인스턴스를 **temp repo + temp storage**로 띄워(실제 프로젝트 repo 미접촉)
 * 다음을 한 번에 검증한다:
 *
 *   health → mission 생성 → checkpoint(observed sha) → verify 실패(error card +
 *   self-correction) → verify 성공(observed) → merge queue → merge(real sha 또는
 *   정직한 dry_run) → skill candidate → kanban → trace → 서버 재시작 후 복원.
 *
 * 정직성: dry_run이면 dry_run으로 명확히 보고한다(가짜 observed 없음). 결과는
 * markdown/json으로 저장한다.
 *
 * 사용:  node scripts/smoke-orchestration-os.mjs   (서버는 먼저 빌드: pnpm --filter @ai-orchestrator/server build)
 * 환경:  SMOKE_PORT(기본 4391) · SMOKE_OUT_DIR(기본 temp) · SMOKE_KEEP=1(임시폴더 보존)
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SERVER_ENTRY = join(REPO_ROOT, "apps", "server", "dist", "index.js");
const PORT = Number(process.env.SMOKE_PORT ?? 4391);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TOKEN = "smoke-orchestration-os-token";
const AUTH = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

/** @type {Array<{ name: string; ok: boolean; critical: boolean; info: string }>} */
const steps = [];
function record(name, ok, critical, info = "") {
  steps.push({ name, ok, critical, info });
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${name}${info ? ` — ${info}` : ""}`);
  return ok;
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: AUTH,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function setupTempRepo(repo) {
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "smoke@local"]);
  git(repo, ["config", "user.name", "smoke"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  writeFileSync(join(repo, "a.txt"), "a\n");
  // 최소 preview dev 서버(설치 불필요) — PORT env로 듣는다. preview observed 착지 증명용.
  writeFileSync(
    join(repo, "preview-server.mjs"),
    [
      'import { createServer } from "node:http";',
      "const port = Number(process.env.PORT || 0);",
      // 일부러 결함 있는 화면: 주요 액션 없음(HTTP) + 가로 overflow div + console 에러(browser).
      'const html = \'<!doctype html><html><head><title>smoke</title></head><body><h1>smoke preview</h1><div style="width:2000px;height:8px;background:#eee"></div><script>console.error("smoke boom")</script></body></html>\';',
      'createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); }).listen(port);',
      "",
    ].join("\n"),
  );
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "init"]);
  git(repo, ["branch", "-M", "main"]);
  git(repo, ["checkout", "-q", "-b", "agent/smoke"]);
  writeFileSync(join(repo, "b.txt"), "b\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "feat"]);
  git(repo, ["checkout", "-q", "main"]);
}

function spawnServer(env, logPath) {
  const child = spawn(process.execPath, [SERVER_ENTRY], { env, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  child.stdout.on("data", (d) => chunks.push(d));
  child.stderr.on("data", (d) => chunks.push(d));
  child.on("exit", () => {
    try {
      writeFileSync(logPath, Buffer.concat(chunks));
    } catch {
      /* ignore */
    }
  });
  return child;
}

async function killServer(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((done) => {
    child.once("exit", () => done(undefined));
    child.kill();
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      done(undefined);
    }, 3_000);
  });
}

async function main() {
  if (!existsSync(SERVER_ENTRY)) {
    console.error(`[smoke] 서버 빌드가 없습니다: ${SERVER_ENTRY}\n먼저: pnpm --filter @ai-orchestrator/server build`);
    process.exit(2);
  }

  const base = mkdtempSync(join(process.env.SMOKE_OUT_DIR ?? tmpdir(), "smoke-orch-os-"));
  const repo = join(base, "repo");
  const scaffoldRepo = join(base, "scaffold-repo");
  const storage = join(base, "storage");
  const skillsOut = join(base, "skills");
  mkdirSync(storage, { recursive: true });
  setupTempRepo(repo);
  // 스캐폴드 대상은 별도 repo(merge repo를 더럽히지 않게) — checkpoint용 git init.
  mkdirSync(scaffoldRepo, { recursive: true });
  git(scaffoldRepo, ["init", "-q"]);
  git(scaffoldRepo, ["config", "user.email", "smoke@local"]);
  git(scaffoldRepo, ["config", "user.name", "smoke"]);
  git(scaffoldRepo, ["config", "commit.gpgsign", "false"]);
  writeFileSync(join(scaffoldRepo, ".keep"), "");
  git(scaffoldRepo, ["add", "-A"]);
  git(scaffoldRepo, ["commit", "-q", "-m", "init"]);
  console.log(`[smoke] temp base: ${base}`);

  const env = {
    ...process.env,
    PORT: String(PORT),
    EVENT_STORAGE_DIR: storage,
    ORCHESTRATOR_API_TOKEN: TOKEN,
    ORCHESTRATOR_ALLOWED_REPO_ROOTS: `${repo},${scaffoldRepo}`,
    ORCHESTRATOR_CHECKPOINT_REPO_ROOT: repo,
    ORCHESTRATOR_ALLOWED_MERGE_TARGETS: "main",
    ORCHESTRATOR_SANDBOX_RUNNER: "local",
    ORCHESTRATOR_VERIFY_CWD: repo,
    ORCHESTRATOR_SKILL_EXPORT_DIR: skillsOut,
    // D5b-2: browser-tier Visual QA 시도(Playwright 미설치/실행실패면 정직하게 skipped).
    ORCHESTRATOR_VISUAL_QA_BROWSER: "1",
    ORCHESTRATOR_VISUAL_QA_SCREENSHOT_DIR: join(base, "shots"),
    // 캐시된 chromium이 있으면 명시(playwright 버전·브라우저 빌드 불일치 회피). 없으면 미설정 → skip.
    ...(process.env.ORCHESTRATOR_VISUAL_QA_CHROMIUM_PATH ? { ORCHESTRATOR_VISUAL_QA_CHROMIUM_PATH: process.env.ORCHESTRATOR_VISUAL_QA_CHROMIUM_PATH } : {}),
    NODE_ENV: "test",
  };

  const missionId = `mission_smoke_${Date.now()}`;
  let server = spawnServer(env, join(base, "server-1.log"));
  let mergeState = "n/a";

  try {
    record("health", await waitForHealth(), true, BASE_URL);

    // 0) 회사 도메인 템플릿은 제품에서 제거됨 — 어떤 id로도 안 보여야 한다(404)
    const removed = await api("POST", "/missions/from-template", { templateId: "example-domain_htv_quote", input: {} });
    record("business template removed (404)", removed.status === 404, true, `status ${removed.status}`);

    // 1) generic app build mission — react_vite_app 템플릿(회사 도메인 0)
    const created = await api("POST", "/missions/from-template", {
      templateId: "react_vite_app",
      missionId,
      input: { appName: "smoke-app", description: "generic app build smoke" },
    });
    const workerRoles = (created.json?.mission?.workers ?? []).map((w) => w.role);
    record("create mission from generic template", created.status === 201 && workerRoles.includes("verifier"), true, `roles ${workerRoles.join(",")}`);

    // 1b) AppWorkspace 붙이기(코딩/디자인 작업공간)
    const wsResp = await api("POST", `/missions/${missionId}/workspace`, { repoRootRef: repo, appType: "react_vite", terminalMode: "read_only", runnerKind: "local" });
    const workspaceId = (wsResp.json?.mission?.workspaces ?? [])[0]?.id;
    record("attach app workspace", wsResp.status === 201 && Boolean(workspaceId), true, workspaceId ? "ok" : `status ${wsResp.status}`);

    // 1c) preview probe(시작 전) — dev 서버 미기동이므로 observed가 아니어야 한다(가짜 금지)
    if (workspaceId) {
      const prev = await api("POST", `/missions/${missionId}/workspace/${workspaceId}/preview`, {});
      const pv = prev.json?.preview;
      record("preview honest before start (not observed)", prev.status === 200 && pv && pv.truthStatus !== "observed", true, pv ? `${pv.status}/${pv.truthStatus}` : `status ${prev.status}`);

      // 1d) preview start — 실제 dev 서버를 띄우고 포트 관측 → observed running
      const started = await api("POST", `/missions/${missionId}/workspace/${workspaceId}/preview/start`, { command: "node preview-server.mjs" });
      const sp = started.json?.preview;
      const previewObserved = started.status === 200 && sp && sp.status === "running" && sp.truthStatus === "observed";
      record("preview start → observed running", Boolean(previewObserved), true, sp ? `${sp.status}/${sp.truthStatus} ${sp.url ?? ""}` : `status ${started.status}`);

      // 1d2) Visual QA — observed preview 위에서 HTML 관측(브라우저 검사는 probe 없으면 skipped)
      if (previewObserved) {
        const qa = await api("POST", `/missions/${missionId}/workspace/${workspaceId}/visual-qa`, {});
        const rep = qa.json?.report;
        record("visual qa observed (HTML tier)", qa.status === 200 && rep && rep.truthStatus === "observed", true, rep ? `${rep.status}/${rep.truthStatus} 이슈 ${rep.issues?.length ?? 0}` : `status ${qa.status}`);
        // 주요 액션 없는 화면 → HTTP-tier가 missing_primary_action 이슈를 잡아야 한다(실측)
        record("design issue caught (missing primary action)", (rep?.issues ?? []).some((i) => i.kind === "missing_primary_action"), false, `${rep?.issues?.length ?? 0} issue(s)`);

        // browser-tier: Playwright가 있으면 overflow/console을 observed로, 없으면 정직하게 skipped
        const browserRan = (rep?.checks ?? []).some((c) => c.kind === "overflow" && c.status !== "skipped");
        const kinds = (rep?.issues ?? []).map((i) => i.kind);
        if (browserRan) {
          const evidence = (rep?.checks ?? []).some((c) => c.kind === "screenshot" && c.evidenceRef);
          const realIssue = kinds.includes("visual_overflow") || kinds.includes("mobile_break") || kinds.includes("console_error");
          record("visual qa browser-tier observed (overflow/console + screenshot)", realIssue && evidence, true, kinds.join(",") || "(no issue)");
        } else {
          const allSkipped = (rep?.checks ?? []).filter((c) => ["overflow", "console_error", "accessibility"].includes(c.kind)).every((c) => c.status === "skipped");
          record("visual qa browser-tier honestly skipped (no browser)", allSkipped, false, "skipped — Playwright 미설치/실행불가");
        }
      }

      // 1e) preview stop — 프로세스 정리(유령 dev 서버 방지)
      const stopped = await api("POST", `/missions/${missionId}/workspace/${workspaceId}/preview/stop`, {});
      record("preview stop", stopped.status === 200 && stopped.json?.preview?.status === "stopped", false, stopped.json?.preview?.status ?? `status ${stopped.status}`);
    }

    // 1f) 스캐폴드 plan/apply — 별도 scaffold repo에 react_vite_app을 실제로 기록(observed)
    const ws2Resp = await api("POST", `/missions/${missionId}/workspace`, { repoRootRef: scaffoldRepo, appType: "react_vite", terminalMode: "build", runnerKind: "local" });
    const ws2 = (ws2Resp.json?.mission?.workspaces ?? []).find((w) => w.repoRootRef === scaffoldRepo)?.id;
    if (ws2) {
      const plan = await api("POST", `/missions/${missionId}/workspace/${ws2}/scaffold/plan`, { templateId: "react_vite_app", input: { appName: "smoke-app" } });
      const pl = plan.json?.plan;
      record("scaffold plan (planned, no write)", plan.status === 201 && pl && pl.truthStatus === "planned" && pl.files.length > 0, true, pl ? `${pl.files.length} files, overwrite ${pl.hasOverwrites}` : `status ${plan.status}`);
      if (pl) {
        const applied = await api("POST", `/missions/${missionId}/scaffold/${pl.id}/apply`, { planId: pl.id });
        const ar = applied.json?.result;
        const wrote = existsSync(join(scaffoldRepo, "package.json")) && existsSync(join(scaffoldRepo, "src", "App.tsx"));
        record("scaffold apply (observed, real files written)", applied.status === 200 && ar && ar.status === "applied" && ar.observed && wrote, true, ar ? `${ar.appliedPaths?.length ?? 0} files${ar.checkpointSha ? ` cp ${ar.checkpointSha.slice(0, 10)}` : ""}` : `status ${applied.status}`);
      }
    }

    // 2) checkpoint(observed sha) — temp repo
    const cp = await api("POST", `/missions/${missionId}/checkpoints`, { repoRoot: repo, gitRef: "HEAD", reason: "manual" });
    const cpSha = cp.json?.checkpoint?.headSha;
    record("checkpoint observed sha", cp.status === 201 && typeof cpSha === "string" && cpSha.length >= 7, true, cpSha ? `sha ${cpSha.slice(0, 10)}` : `status ${cp.status}`);

    // 3) verify 실패 → error card + self-correction
    const vfail = await api("POST", `/missions/${missionId}/verify`, { commands: ["git show refs/smoke/definitely-missing"] });
    record("verify (failing) accepted", vfail.status === 202, true, `status ${vfail.status}`);
    const afterFail = (await api("GET", `/missions/${missionId}`)).json?.mission;
    record("error card emitted", (afterFail?.errorCards?.length ?? 0) > 0, true, `${afterFail?.errorCards?.length ?? 0} card(s)`);
    record("self-correction suggested", (afterFail?.selfCorrections?.length ?? 0) > 0, true, afterFail?.selfCorrections?.[0]?.action ?? "none");
    record("auto checkpoint before verify", (afterFail?.checkpoints?.length ?? 0) > 0, false, `${afterFail?.checkpoints?.length ?? 0} checkpoint(s)`);

    // 4) verify 성공(observed)
    const vpass = await api("POST", `/missions/${missionId}/verify`, { commands: ["git status"] });
    const passReport = (vpass.json?.mission?.verificationReports ?? []).filter((r) => r.status === "passed" && r.observed).pop();
    record("verify (passing) observed", Boolean(passReport), true, passReport ? `report ${passReport.id}` : "no observed pass");

    // 5) merge queue (검증 통과 보고 참조)
    if (passReport) {
      const queued = await api("POST", `/missions/${missionId}/events`, {
        type: "mission.merge.queued",
        payload: {
          item: {
            id: "merge_smoke_1",
            missionId,
            branchName: "agent/smoke",
            status: "queued",
            requiredVerificationReportId: passReport.id,
            sourceBranch: "agent/smoke",
            targetBranch: "main",
            repoRoot: repo,
            reason: "smoke queue",
            queuedAt: new Date().toISOString(),
          },
        },
      });
      record("merge queued", queued.status === 202, true, `status ${queued.status}`);

      // 6) merge — real sha 또는 정직한 dry_run/blocked (가짜 observed 없음)
      const merged = await api("POST", `/missions/${missionId}/merge`, { mergeQueueItemId: "merge_smoke_1" });
      const item = (merged.json?.mission?.mergeQueueItems ?? []).find((m) => m.id === "merge_smoke_1");
      mergeState = item?.status ?? `status ${merged.status}`;
      const honest = item && ["merged", "dry_run", "conflict", "blocked", "failed"].includes(item.status);
      const noFakeSha = item?.status === "merged" ? typeof item.mergeCommitSha === "string" && item.mergeCommitSha.length >= 7 : item?.mergeCommitSha === undefined;
      record("merge honest (real sha XOR no sha)", Boolean(honest && noFakeSha), true, `${mergeState}${item?.mergeCommitSha ? ` ${item.mergeCommitSha.slice(0, 10)}` : ""}`);

      // 7) skill candidate (merged일 때만)
      if (item?.status === "merged") {
        const skills = await api("GET", `/missions/${missionId}/skills`);
        const candidates = skills.json?.candidates ?? [];
        record("skill candidate suggested", candidates.length > 0 && candidates.every((c) => c.trustStatus === "suggested"), false, `${candidates.length} candidate(s)`);
      } else {
        record("skill candidate (skipped — not merged)", true, false, mergeState);
      }
    }

    // 8) kanban + trace
    const kanban = await api("GET", "/missions/kanban");
    const onBoard = (kanban.json?.board?.columns ?? []).some((c) => c.cards.some((card) => card.missionId === missionId));
    record("kanban shows mission", kanban.status === 200 && onBoard, true, `total ${kanban.json?.board?.total ?? 0}`);

    const trace = await api("GET", `/missions/${missionId}/trace`);
    const traceTypes = new Set((trace.json?.trace ?? []).map((e) => e.type));
    record("trace has created + verification + error card", trace.status === 200 && traceTypes.has("mission.created") && traceTypes.has("verification.recorded") && traceTypes.has("error_card.recorded"), true, `${(trace.json?.trace ?? []).length} events`);

    // 9) 서버 재시작 후 복원 (EventStorage 영속)
    await killServer(server);
    server = spawnServer(env, join(base, "server-2.log"));
    record("health after restart", await waitForHealth(), true, "restart");
    const restored = await api("GET", `/missions/${missionId}`);
    record("mission restored after restart", restored.status === 200 && restored.json?.mission?.mission?.missionId === missionId, true, `status ${restored.status}`);
  } finally {
    await killServer(server);
  }

  // 리포트 저장
  const passed = steps.filter((s) => s.ok).length;
  const failedCritical = steps.filter((s) => !s.ok && s.critical);
  const summary = {
    ok: failedCritical.length === 0,
    passed,
    total: steps.length,
    mergeState,
    failedCritical: failedCritical.map((s) => s.name),
    steps,
    base,
    generatedAt: new Date().toISOString(),
  };
  const jsonPath = join(base, "smoke-report.json");
  const mdPath = join(base, "smoke-report.md");
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Orchestration OS Smoke Report`,
      ``,
      `- result: **${summary.ok ? "PASS" : "FAIL"}** (${passed}/${steps.length} steps)`,
      `- merge: ${mergeState}`,
      `- generated: ${summary.generatedAt}`,
      ``,
      `| step | result | info |`,
      `| --- | --- | --- |`,
      ...steps.map((s) => `| ${s.name} | ${s.ok ? "✓" : "✗"}${s.critical ? "" : " (opt)"} | ${s.info} |`),
      ``,
    ].join("\n"),
  );

  console.log(`\n[smoke] ${summary.ok ? "PASS" : "FAIL"} — ${passed}/${steps.length} steps, merge=${mergeState}`);
  console.log(`[smoke] report: ${mdPath}`);
  if (!process.env.SMOKE_KEEP) {
    try {
      rmSync(base, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`[smoke] crashed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
