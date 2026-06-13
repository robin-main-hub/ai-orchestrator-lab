import type { DesignBlueprintInput } from "./designBlueprint.js";
import type { MissionAgentRole, MissionCreateRequest, MissionWorkerAssignmentRequest } from "./productKernel.js";

/**
 * Design Mission — DesignBlueprint를 실제 Mission으로 승격한다(역할 배정). 회사 업무가
 * 아니라 **코딩/디자인 전용 핵심 페르소나**만 둔다. 권한은 캐릭터가 아니라 capability가
 * 결정한다(companion은 write 권한 있어도 직접 mutate 금지, builder만 sandbox_build,
 * verifier는 검증만).
 *
 * designBlueprint(스키마) + productKernel(역할/미션)을 둘 다 import하지만, productKernel은
 * 이 모듈을 import하지 않으므로 순환이 없다.
 */

export type DesignTeamMember = { role: MissionAgentRole; slot: string; function: string };

export const DESIGN_TEAM: ReadonlyArray<DesignTeamMember> = [
  { role: "companion", slot: "lead_companion", function: "사용자 의도 해석·최종 조율" },
  { role: "architect", slot: "product_designer", function: "화면 구조·정보 위계" },
  { role: "builder", slot: "frontend_builder", function: "React/Tailwind 구현 (sandbox_build)" },
  { role: "reviewer", slot: "interaction_critic", function: "클릭 동선·상태·빈화면·오류상태 검토" },
  { role: "auditor", slot: "accessibility_auditor", function: "키보드·대비·aria·reduced motion" },
  { role: "verifier", slot: "verifier", function: "테스트·빌드·visual QA (검증만, write 금지)" },
];

/**
 * 블루프린트 입력 → MissionCreateRequest(순수). DESIGN_TEAM을 워커로, 화면/토큰/수용기준을
 * goal에 정직하게 풀어쓴다. capability는 서버가 역할에서 재계산한다.
 */
export function buildMissionCreateFromBlueprint(
  input: DesignBlueprintInput,
  opts: { missionId: string; createdBy?: string; debateId?: string },
): MissionCreateRequest {
  const workers: MissionWorkerAssignmentRequest[] = DESIGN_TEAM.map((member, index) => ({
    agentId: `design_${member.role}_${index + 1}`,
    role: member.role,
    displayName: member.slot,
    soulMode: "summary",
    configSource: "internal",
  }));
  const screenLines = input.screens.map((screen) => `· ${screen.name}: ${screen.purpose} (주요액션 ${screen.primaryAction})`).join("\n");
  const goal = [
    `[디자인] ${input.title}`,
    `의도 — ${input.userIntent}`,
    `대상 — ${input.targetSurface}`,
    `톤 — ${input.designTokens.tone} · 밀도 ${input.designTokens.density} · 모션 ${input.designTokens.motion}`,
    `화면 —\n${screenLines}`,
    input.acceptanceCriteria.length ? `수용 기준 — ${input.acceptanceCriteria.join("; ")}` : "",
    "외부 발송 없음 — 시안/구현 draft만.",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
  return {
    id: opts.missionId,
    title: `[디자인] ${input.title}`.slice(0, 300),
    goal,
    debateId: opts.debateId, // 토론에서 승격된 미션이면 출처 토론 id를 단다(provenance)
    truthStatus: "planned",
    createdBy: opts.createdBy ?? "design_blueprint",
    workers,
  };
}
