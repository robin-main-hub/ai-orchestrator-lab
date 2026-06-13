import { createAgentMissionCapability } from "@ai-orchestrator/agents";
import type {
  AgentProfile,
  MissionWorkerAssignment,
  MissionWorkerAssignmentRequest,
  VerificationReport,
} from "@ai-orchestrator/protocol";

/**
 * 서버는 클라이언트 payload를 믿지 않는다.
 *
 * - worker capability는 wire에서 받지 않고 역할에서 재계산한다
 *   (같은 createAgentMissionCapability — desktop과 정책 드리프트 없음).
 *   companion에 canMutateFiles=true를 실어 보내는 류의 권한 스푸핑이 여기서 죽는다.
 * - verification report의 observed 주장은 실측 근거(모든 check에 exit code)가
 *   없으면 강등된다 — 가짜 green 방지 (TruthStatus 원칙).
 */

export function normalizeMissionWorker(
  request: MissionWorkerAssignmentRequest,
  missionId: string,
  now: string,
): MissionWorkerAssignment {
  const profile: AgentProfile = {
    id: request.agentId,
    name: request.displayName,
    kind: "virtual",
    role: request.role,
    personaName: request.personaName,
    soulMode: request.soulMode,
    configSource: request.configSource,
    enabled: true,
    permissionLevel: request.permissionLevel,
  };
  const capability = createAgentMissionCapability(profile);
  const continuity = request.hermesSlotId
    ? {
        ...capability.personaContinuity,
        hermes: { ...capability.personaContinuity.hermes, slotId: request.hermesSlotId },
      }
    : capability.personaContinuity;

  return {
    id: `worker_${missionId}_${request.agentId}`,
    missionId,
    agentId: request.agentId,
    role: request.role,
    status: "assigned",
    capability: { ...capability, personaContinuity: continuity },
    assignedAt: now,
  };
}

export type VerificationNormalization = {
  report: VerificationReport;
  observedDowngraded: boolean;
};

/** observed=true는 모든 check가 exit code를 가진 실측일 때만 유지된다. */
export function normalizeVerificationReport(report: VerificationReport): VerificationNormalization {
  const hasEvidence = report.checks.length > 0 && report.checks.every((check) => typeof check.exitCode === "number");
  if (report.observed && !hasEvidence) {
    return { report: { ...report, observed: false }, observedDowngraded: true };
  }
  return { report, observedDowngraded: false };
}
