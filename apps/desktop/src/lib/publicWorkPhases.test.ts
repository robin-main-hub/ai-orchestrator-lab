import { describe, expect, it } from "vitest";
import {
  PUBLIC_WORK_PHASES,
  type PublicWorkPhaseId,
  publicWorkPhaseLabel,
} from "./publicWorkPhases";

// Characterization tests for the public work-phase label lookup (no behavior
// change). publicWorkPhaseLabel is an exhaustive switch from a phase id to its
// Korean label, sourced from the PUBLIC_WORK_PHASES table. These pin every id's
// label and the table's internal id↔label consistency. All pure.
describe("publicWorkPhaseLabel", () => {
  it("maps every phase id to its Korean label", () => {
    expect(publicWorkPhaseLabel("thinking")).toBe("생각");
    expect(publicWorkPhaseLabel("tool_call")).toBe("도구 호출");
    expect(publicWorkPhaseLabel("test")).toBe("테스트");
    expect(publicWorkPhaseLabel("command_generation")).toBe("명령 생성");
    expect(publicWorkPhaseLabel("verification")).toBe("검증");
    expect(publicWorkPhaseLabel("receipt")).toBe("작업 영수증");
  });

  it("covers all six declared phase ids", () => {
    const ids: PublicWorkPhaseId[] = [
      "thinking",
      "tool_call",
      "test",
      "command_generation",
      "verification",
      "receipt",
    ];
    const labels = ids.map(publicWorkPhaseLabel);
    expect(new Set(labels).size).toBe(ids.length);
    expect(labels.every((label) => label.length > 0)).toBe(true);
  });

  it("agrees with the PUBLIC_WORK_PHASES table for each entry's id", () => {
    for (const phase of Object.values(PUBLIC_WORK_PHASES)) {
      expect(publicWorkPhaseLabel(phase.id)).toBe(phase.label);
    }
  });
});
