import { memoryRecordSchema, type MemoryRecord } from "@ai-orchestrator/protocol";
import { sanitizePublicText } from "./publicRedaction";
import { loopStatusLabel } from "./autonomyRunForm";
import type { LoopStatus } from "./closedLoopController";
import { createMemoryCuratorCandidate, type MemoryCuratorCandidate } from "./memoryCuratorApproval";
import { type SkillArchiveCandidate, isRuntimeLoadableSkill } from "@ai-orchestrator/protocol";
import type { AgentConfigFile } from "../types";
/**
 * Turn a finished autonomous run into a long-term memory candidate, so the
 * system can remember what it executed (subject to the same curator approval as
 * conversation-turn candidates). Pure; the record is schema-validated.
 */

const PROJECT_ID = "project_ai_orchestrator_lab";

export function createAutonomyRunMemoryCandidate(input: {
  runId: string;
  sessionId: string;
  personaName: string;
  role: string;
  goal: string;
  loopStatus: LoopStatus;
  stepCount: number;
  createdAt: string;
  trustLevel?: MemoryRecord["trustLevel"];
}): MemoryCuratorCandidate {
  const persona = sanitizePublicText(input.personaName) || "agent";
  const goal = sanitizePublicText(input.goal);
  const statusLabel = loopStatusLabel(input.loopStatus);
  const content = compact(
    `자율 실행: ${persona}가 ${input.role} pane에서 "${goal}"를 실행 → ${statusLabel} (${input.stepCount}단계)`,
  );

  const record = memoryRecordSchema.parse({
    id: `memory_autonomy_run_${input.runId}`,
    layer: "episode",
    scope: "session",
    kind: "workflow",
    title: `${persona} 자율 실행 기억 후보`,
    content,
    sourceChannel: "agent",
    trustLevel: input.trustLevel ?? "limited",
    projectId: PROJECT_ID,
    sessionId: input.sessionId,
    activationState: "suggested",
    createdAt: input.createdAt,
    losslessRestatement: compact(
      `${input.createdAt} ${persona}가 ${input.role} pane에서 "${goal}" 작업을 자율 실행했고 결과는 ${statusLabel}였다 (${input.stepCount} 단계).`,
    ),
    keywords: uniqueWords(`${goal} ${persona} ${input.role} ${input.loopStatus} autonomy`).slice(0, 12),
    topic: "Autonomous execution run",
    importance: 0.6,
    entityReinforcement: 0,
    pinned: false,
    tags: [
      "autonomy",
      "curator-candidate",
      `agent:${persona}`,
      `run:${input.runId}`,
      `status:${input.loopStatus}`,
    ],
  }) as MemoryRecord;

  return createMemoryCuratorCandidate({
    agentId: persona,
    createdAt: input.createdAt,
    reason: "자율 실행 결과 장기 기억",
    record,
  });
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

function uniqueWords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9가-힣]+/i)
        .map((word) => word.trim())
        .filter((word) => word.length > 1),
    ),
  );
}

/**
 * Enforces that skills loaded during agent runtime must satisfy the isRuntimeLoadableSkill() contract.
 * Converts valid SkillArchiveCandidates into AgentConfigFile (kind: "skill") for the runtime.
 */
export function loadRuntimeSkills(candidates: SkillArchiveCandidate[]): AgentConfigFile[] {
  return candidates
    .filter(isRuntimeLoadableSkill)
    .map((candidate) => ({
      id: `config_skill_learned_${candidate.id}`,
      kind: "skill",
      scope: "global",
      path: `agents/skills/${candidate.id}.md`,
      label: candidate.title,
      body: candidate.summary + (candidate.reusablePrompt ? `\n\n${candidate.reusablePrompt}` : ""),
      linkedAgentIds: [], // Skills might be globally applicable or need specific linking logic
      tags: ["learned_skill", candidate.source],
      version: 1,
      updatedAt: candidate.createdAt,
    }));
}
