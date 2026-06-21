import {
  scaffoldForTemplate,
  type MissionScaffoldLatestResponse,
  type MissionScaffoldLatestSafeFile,
  type MissionScaffoldLatestSkipped,
  type ScaffoldFile,
  type ScaffoldOverlay,
  type ScaffoldPlan,
} from "@ai-orchestrator/protocol";

/**
 * Publish Flow prefill을 위한 mission scaffold latest materializer(순수).
 *
 * 정직성(러시아 심판 기준):
 *   - plan record에서 templateId+input을 그대로 받아 scaffoldForTemplate으로 path+content를
 *     **결정적으로** 재생성한다. 추측 0.
 *   - 가드 통과한 파일만 files에 들어간다. 위반한 파일은 skipped에 사유와 함께 남는다.
 *   - 가드는 클라이언트 missionPublishPrefill의 거울이지만, 외부로 노출되는 truth source가
 *     서버이므로 서버가 우선이다. binary/too_large/secret_suspect는 W3a 한도/정책과 일치.
 *   - status="found"는 가드 통과 파일이 1개 이상일 때만. 그 외엔 "not_found" 또는 "partial".
 */

const FILE_BYTE_MAX = 256 * 1024;

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgho_[A-Za-z0-9]{20,}\b/,
  /\bghs_[A-Za-z0-9]{20,}\b/,
  /\bghu_[A-Za-z0-9]{20,}\b/,
  /\bghr_[A-Za-z0-9]{20,}\b/,
  // 세분화(fine-grained) PAT(github_pat_) — 2022+ GitHub 권장 형식. prefix·underscore가
  // classic과 달라 위 ghp_/gho_/… 규칙으로는 안 잡힌다(W1 서버 scanner와 동일한 별도 패턴).
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{40,}\b/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bAuthorization\s*:\s*Bearer\s+\S+/i,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
];

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** 가장 마지막에 만들어진 plan을 선택. event 도착 순서 = createdAt 순서이므로 배열 끝. */
export function pickLatestScaffoldPlan(plans: ReadonlyArray<ScaffoldPlan>): ScaffoldPlan | undefined {
  if (plans.length === 0) return undefined;
  return plans[plans.length - 1];
}

/**
 * 한 plan에서 안전 파일 / 스킵 목록을 결정. 외부 호출 0(서버 in-process 순수).
 * scaffoldForTemplate이 빈 배열을 반환하면(템플릿 미지원) skipped: unsupported 1건.
 */
export function materializeScaffoldLatestFromPlan(plan: ScaffoldPlan): {
  files: MissionScaffoldLatestSafeFile[];
  skipped: MissionScaffoldLatestSkipped[];
} {
  const regenerated: ScaffoldFile[] = scaffoldForTemplate(plan.templateId, plan.input);
  if (regenerated.length === 0) {
    return { files: [], skipped: [{ reason: "unsupported" }] };
  }
  const files: MissionScaffoldLatestSafeFile[] = [];
  const skipped: MissionScaffoldLatestSkipped[] = [];
  for (const file of regenerated) {
    const path = (file.path ?? "").trim();
    if (!path) {
      // 빈 path는 unsupported로 분류(템플릿 정의 자체가 비정상).
      skipped.push({ reason: "unsupported" });
      continue;
    }
    const content = file.content ?? "";
    if (!content) {
      skipped.push({ path, reason: "missing_content" });
      continue;
    }
    if (content.includes("\0")) {
      skipped.push({ path, reason: "binary" });
      continue;
    }
    if (utf8ByteLength(content) > FILE_BYTE_MAX) {
      skipped.push({ path, reason: "too_large" });
      continue;
    }
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
      skipped.push({ path, reason: "secret_suspect" });
      continue;
    }
    files.push({
      path,
      content,
      source: "scaffold_plan",
      createdAt: plan.createdAt,
    });
  }
  return { files, skipped };
}

/**
 * record(ServerMissionRecord의 scaffoldPlans 배열을 받음)에서 최신 plan을 골라
 * MissionScaffoldLatestResponse를 만든다.
 *
 *  - plans 배열이 비면 status="not_found"
 *  - plan은 있지만 안전 파일이 0이면 status="not_found"(가드 사유는 skipped로 노출)
 *  - 일부 파일만 통과하면 status="partial"
 *  - 모두 통과하면 status="found"
 */
/**
 * overlay 파일 1건이 base의 같은 path를 덮어쓸 자격이 있는지 가드 후 결정. overlay라고 면제 X.
 * 차단되면 skipped에 path+reason을 남기고 새 파일은 들이지 않는다.
 */
function checkOverlayFile(
  path: string,
  content: string,
): { ok: true } | { ok: false; reason: MissionScaffoldLatestSkipped["reason"] } {
  if (!content) return { ok: false, reason: "missing_content" };
  if (content.includes("\0")) return { ok: false, reason: "binary" };
  if (utf8ByteLength(content) > FILE_BYTE_MAX) return { ok: false, reason: "too_large" };
  if (SECRET_PATTERNS.some((p) => p.test(content))) return { ok: false, reason: "secret_suspect" };
  // path가 base에 있을 때만 덮어쓴다는 정책: base에 없는 path는 응답에서 추가하지 않는다(현재 결정).
  void path;
  return { ok: true };
}

export function buildMissionScaffoldLatestResponse(input: {
  missionId: string;
  plans: ReadonlyArray<ScaffoldPlan>;
  /** 사용자 확정 patch들(시간순). 같은 path가 여러 overlay에 있으면 마지막 overlay가 이긴다. */
  overlays?: ReadonlyArray<ScaffoldOverlay>;
}): MissionScaffoldLatestResponse {
  const latest = pickLatestScaffoldPlan(input.plans);
  if (!latest) {
    return {
      missionId: input.missionId,
      status: "not_found",
      truthStatus: "configured",
      files: [],
      skipped: [],
      message: "이 mission에 등록된 scaffold plan이 없습니다",
    };
  }
  const base = materializeScaffoldLatestFromPlan(latest);
  // 같은 path에 대해 마지막 overlay 한 건만 효력 — Map으로 자연스럽게.
  const overlayByPath = new Map<string, { content: string; createdAt: string }>();
  const overlaySkipped: MissionScaffoldLatestSkipped[] = [];
  for (const overlay of input.overlays ?? []) {
    for (const file of overlay.files) {
      const path = (file.path ?? "").trim();
      if (!path) continue;
      const guard = checkOverlayFile(path, file.content ?? "");
      if (!guard.ok) {
        overlaySkipped.push({ path, reason: guard.reason });
        continue;
      }
      overlayByPath.set(path, { content: file.content, createdAt: overlay.createdAt });
    }
  }
  // base 파일 위에 overlay를 덮어쓴다. base에 없는 overlay path는 들이지 않는다(정책 — 위 코멘트 참고).
  const merged: MissionScaffoldLatestSafeFile[] = base.files.map((f) => {
    const ov = overlayByPath.get(f.path);
    if (!ov) return f;
    return { path: f.path, content: ov.content, source: "scaffold_overlay", createdAt: ov.createdAt };
  });
  const skipped: MissionScaffoldLatestSkipped[] = [...base.skipped, ...overlaySkipped];
  let status: MissionScaffoldLatestResponse["status"];
  if (merged.length === 0) {
    status = "not_found";
  } else if (skipped.length > 0) {
    status = "partial";
  } else {
    status = "found";
  }
  return {
    missionId: input.missionId,
    status,
    truthStatus: latest.truthStatus,
    files: merged,
    skipped,
    planId: latest.id,
    message: status === "not_found"
      ? "scaffold plan은 있지만 가드를 통과한 파일이 없습니다"
      : undefined,
  };
}
