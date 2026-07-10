export type PublicWorkPhaseId =
  | "thinking"
  | "tool_call"
  | "test"
  | "command_generation"
  | "verification"
  | "receipt";

export type PublicWorkPhase = {
  id: PublicWorkPhaseId;
  label: string;
};

export const PUBLIC_WORK_PHASES = {
  commandGeneration: { id: "command_generation", label: "명령 생성" },
  receipt: { id: "receipt", label: "작업 브리핑" },
  test: { id: "test", label: "테스트" },
  thinking: { id: "thinking", label: "생각" },
  toolCall: { id: "tool_call", label: "도구 호출" },
  verification: { id: "verification", label: "검증" },
} as const satisfies Record<string, PublicWorkPhase>;

export function publicWorkPhaseLabel(id: PublicWorkPhaseId): string {
  switch (id) {
    case "thinking":
      return PUBLIC_WORK_PHASES.thinking.label;
    case "tool_call":
      return PUBLIC_WORK_PHASES.toolCall.label;
    case "test":
      return PUBLIC_WORK_PHASES.test.label;
    case "command_generation":
      return PUBLIC_WORK_PHASES.commandGeneration.label;
    case "verification":
      return PUBLIC_WORK_PHASES.verification.label;
    case "receipt":
      return PUBLIC_WORK_PHASES.receipt.label;
  }
}
