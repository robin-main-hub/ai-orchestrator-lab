import type {
  AgentProfile,
  MissionAgentRole,
  MissionCapabilityMode,
  MissionToolName,
  MissionWorkerAssignment,
  MissionWorkerCapability,
  PersonaContinuitySpec,
  SandboxKind,
  TruthStatus,
} from "@ai-orchestrator/protocol";

/**
 * Runtime contract bridge: character persona stays vivid, but executable power
 * is expressed as a capability profile bound to sandbox + verifier contracts.
 *
 * This is intentionally pure. UI/server layers can call it before assigning a
 * worker to a Mission, and tests can prove that "personality preservation" does
 * not accidentally grant file or shell powers.
 */

export type MissionCapabilityOptions = {
  defaultSandboxKind?: SandboxKind;
  truthStatus?: TruthStatus;
  now?: string;
};

const DEFAULT_SANDBOX_KIND: SandboxKind = "docker_gvisor";
const DEFAULT_TRUTH_STATUS: TruthStatus = "configured";

const BUILD_TOOLS: MissionToolName[] = [
  "complete",
  "read",
  "grep",
  "glob",
  "write",
  "edit",
  "bash",
  "todo",
  "diff",
  "verify",
  "memory_recall",
  "tmux_capture",
];

const VERIFY_TOOLS: MissionToolName[] = [
  "complete",
  "read",
  "grep",
  "glob",
  "bash",
  "todo",
  "diff",
  "verify",
  "memory_recall",
  "tmux_capture",
];

const PLAN_TOOLS: MissionToolName[] = [
  "complete",
  "read",
  "grep",
  "glob",
  "todo",
  "diff",
  "memory_recall",
];

const RESEARCH_TOOLS: MissionToolName[] = [
  "complete",
  "read",
  "grep",
  "glob",
  "todo",
  "memory_recall",
];

const MEMORY_TOOLS: MissionToolName[] = [
  "complete",
  "read",
  "memory_recall",
  "memory_write_request",
  "todo",
];

const MERGE_RECOMMEND_TOOLS: MissionToolName[] = [
  "complete",
  "read",
  "grep",
  "glob",
  "todo",
  "diff",
  "verify",
  "merge_recommend",
  "memory_recall",
];

const CONVERSATION_TOOLS: MissionToolName[] = [
  "complete",
  "memory_recall",
  "todo",
];

export function personaSlugForMission(profile: Pick<AgentProfile, "role" | "personaName">): string {
  return profile.personaName ?? profile.role;
}

export function missionCapabilityModeForRole(role: MissionAgentRole): MissionCapabilityMode {
  switch (role) {
    case "builder":
    case "executor":
      return "sandbox_build";
    case "reviewer":
    case "skeptic":
    case "verifier":
    case "auditor":
    case "risk_officer":
    case "watchdog":
      return "sandbox_verify";
    case "architect":
      return "plan_only";
    case "memory_curator":
      return "memory_curate";
    case "researcher":
    case "external":
    case "domain_expert":
      return "research";
    case "orchestrator":
    case "companion":
    case "mediator":
    case "negotiator":
      return "merge_recommend";
    default:
      return "conversation_only";
  }
}

export function allowedToolsForMissionMode(mode: MissionCapabilityMode): MissionToolName[] {
  switch (mode) {
    case "sandbox_build":
      return [...BUILD_TOOLS];
    case "sandbox_verify":
      return [...VERIFY_TOOLS];
    case "plan_only":
      return [...PLAN_TOOLS];
    case "memory_curate":
      return [...MEMORY_TOOLS];
    case "research":
      return [...RESEARCH_TOOLS];
    case "merge_recommend":
      return [...MERGE_RECOMMEND_TOOLS];
    case "conversation_only":
    default:
      return [...CONVERSATION_TOOLS];
  }
}

export function canMissionModeMutateFiles(mode: MissionCapabilityMode): boolean {
  return mode === "sandbox_build";
}

export function canMissionModeRunCommands(mode: MissionCapabilityMode): boolean {
  return mode === "sandbox_build" || mode === "sandbox_verify";
}

export function requiresMissionSandbox(mode: MissionCapabilityMode): boolean {
  return mode === "sandbox_build" || mode === "sandbox_verify";
}

export function createHermesPersonaContinuity(
  profile: AgentProfile,
  options: MissionCapabilityOptions = {},
): PersonaContinuitySpec {
  const personaSlug = personaSlugForMission(profile);
  const truthStatus = options.truthStatus ?? DEFAULT_TRUTH_STATUS;
  const baseDir = `agents/${personaSlug}`;
  const fullMarkdown = profile.configSource === "markdown" || profile.soulMode === "full";

  return {
    agentId: profile.id,
    personaSlug,
    displayName: profile.name,
    role: profile.role,
    soulMode: profile.soulMode,
    configSource: profile.configSource,
    identityFiles: [
      {
        kind: "SOUL",
        path: `${baseDir}/SOUL.md`,
        required: fullMarkdown,
        truthStatus,
      },
      {
        kind: "AGENTS",
        path: `${baseDir}/AGENTS.md`,
        required: fullMarkdown,
        truthStatus,
      },
      {
        kind: "IDENTITY",
        path: `${baseDir}/IDENTITY.md`,
        required: fullMarkdown,
        truthStatus,
      },
      {
        kind: "USER",
        path: `${baseDir}/USER.md`,
        required: fullMarkdown,
        truthStatus,
      },
    ],
    hermes: {
      slotId: `hermes:${personaSlug}`,
      sticky: true,
      memoryScope: `persona:${personaSlug}:role:${profile.role}`,
      restorePolicy: profile.soulMode === "off" ? "summary_only" : "restore_when_available",
      promotionPolicy: "curator_required",
    },
    voice: {
      preserveCharacterVoice: true,
      allowSpeechQuirks: true,
      allowEmotionalColor: true,
      forbiddenSuppressionReasons: [
        "generic_business_tone",
        "tool_access_enabled",
        "sandbox_execution",
        "verification_mode",
      ],
      safetyOverrideNote:
        "Safety and tool gates may constrain actions, but must not flatten the character voice unless a concrete policy requires it.",
    },
  };
}

export function createAgentMissionCapability(
  profile: AgentProfile,
  options: MissionCapabilityOptions = {},
): MissionWorkerCapability {
  const mode = missionCapabilityModeForRole(profile.role);
  const allowedTools = allowedToolsForMissionMode(mode);
  const requiresSandbox = requiresMissionSandbox(mode);
  const canMutateFiles = canMissionModeMutateFiles(mode);
  const canRunCommands = canMissionModeRunCommands(mode);
  const defaultSandboxKind = requiresSandbox
    ? options.defaultSandboxKind ?? DEFAULT_SANDBOX_KIND
    : "disabled";

  return {
    agentId: profile.id,
    role: profile.role,
    displayName: profile.name,
    personaName: profile.personaName,
    mode,
    allowedTools,
    canMutateFiles,
    canRunCommands,
    requiresSandbox,
    defaultSandboxKind,
    requiresHumanApprovalFor: createApprovalToolList({ canMutateFiles, canRunCommands, allowedTools }),
    personaContinuity: createHermesPersonaContinuity(profile, options),
    notes: createCapabilityNotes(profile.role, mode),
  };
}

function createApprovalToolList(input: {
  canMutateFiles: boolean;
  canRunCommands: boolean;
  allowedTools: MissionToolName[];
}): MissionToolName[] {
  const approvals = new Set<MissionToolName>();
  if (input.canMutateFiles) {
    approvals.add("write");
    approvals.add("edit");
  }
  if (input.canRunCommands) {
    approvals.add("bash");
  }
  if (input.allowedTools.includes("tmux_dispatch")) {
    approvals.add("tmux_dispatch");
  }
  if (input.allowedTools.includes("memory_write_request")) {
    approvals.add("memory_write_request");
  }
  return [...approvals];
}

function createCapabilityNotes(role: MissionAgentRole, mode: MissionCapabilityMode): string[] {
  const notes = [
    `role ${role} maps to mission capability mode ${mode}`,
    "persona voice is preserved; capabilities only constrain side effects",
  ];
  if (mode === "sandbox_build") {
    notes.push("file mutation is allowed only inside the assigned sandbox/worktree");
  }
  if (mode === "sandbox_verify") {
    notes.push("verification may run commands, but must not write product files");
  }
  if (mode === "merge_recommend") {
    notes.push("orchestration can recommend merge, but sequential merge queue owns the side effect");
  }
  return notes;
}

export function createMissionWorkerAssignment(input: {
  missionId: string;
  profile: AgentProfile;
  now: string;
  sandboxId?: string;
  worktreePath?: string;
  branchName?: string;
  options?: MissionCapabilityOptions;
}): MissionWorkerAssignment {
  const capability = createAgentMissionCapability(input.profile, input.options);
  return {
    id: `worker_${input.missionId}_${input.profile.id}`,
    missionId: input.missionId,
    agentId: input.profile.id,
    role: input.profile.role,
    status: "planned",
    capability,
    sandboxId: input.sandboxId,
    worktreePath: input.worktreePath,
    branchName: input.branchName,
    assignedAt: input.now,
  };
}

export function buildPersonaContinuitySystemReminder(capability: MissionWorkerCapability): string {
  return [
    `[Persona Continuity: ${capability.displayName}]`,
    `- Role/capability: ${capability.role} / ${capability.mode}`,
    `- Hermes slot: ${capability.personaContinuity.hermes.slotId}`,
    `- Memory scope: ${capability.personaContinuity.hermes.memoryScope}`,
    "- Keep the character's speech style, emotional color, and SOUL/AGENTS decision habits.",
    "- Do not become a generic coding assistant just because tools or sandbox are enabled.",
    capability.canMutateFiles
      ? "- File changes are allowed only inside the assigned Mission sandbox/worktree and still follow approval gates."
      : "- Do not mutate files. Provide plans, critique, verification results, or merge recommendations only.",
    capability.canRunCommands
      ? "- Commands must run through the sandbox runner or approved legacy gate; never imply host-shell authority."
      : "- Do not claim command execution. Ask a sandbox-capable worker when execution is needed.",
  ].join("\n");
}

/**
 * 기존 워크스페이스 프로필(예: defaultAgentProfiles, 또는 사용자가 구성한
 * AgentProfile 배열)을 한 번에 Mission capability로 변환하는 진입점.
 *
 * 새 계약을 평행 레이어로 두지 않고 "기존 프로필 위에 얹는" 첫 배선 지점이다 —
 * server/UI는 이미 들고 있는 프로필을 그대로 넘겨 capability/sandbox/persona
 * 경계를 얻는다. 순수 함수라 입력 프로필에만 의존하고 모듈 순환을 만들지 않는다.
 */
export function missionCapabilitiesForProfiles(
  profiles: ReadonlyArray<AgentProfile>,
  options: MissionCapabilityOptions = {},
): MissionWorkerCapability[] {
  return profiles.filter((profile) => profile.enabled).map((profile) => createAgentMissionCapability(profile, options));
}
