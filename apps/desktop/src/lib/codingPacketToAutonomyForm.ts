import type { CodingPacket, TmuxPaneRole } from "@ai-orchestrator/protocol";
import type { AutonomyMode } from "./autonomousRun";
import { DEFAULT_AUTONOMY_FORM, type AutonomyRunForm } from "./autonomyRunForm";

/**
 * Bridge the product's core flow — "a debate/conversation produces a
 * CodingPacket, then that work is handed off for execution" — to the autonomy
 * layer. Maps a CodingPacket into a prefilled Autonomy Run form: the packet
 * goal becomes the kickoff goal and its verificationPlan becomes the loop's
 * verification steps. Pure, so it is unit-tested without a DOM.
 */
export function codingPacketToAutonomyForm(
  packet: CodingPacket,
  options: { personaName?: string; role?: TmuxPaneRole; mode?: AutonomyMode } = {},
): AutonomyRunForm {
  return {
    personaName: options.personaName ?? DEFAULT_AUTONOMY_FORM.personaName,
    // Coding packets default to the code pane unless the caller overrides.
    role: options.role ?? "code",
    goal: packet.goal,
    verificationStepsText: packet.verificationPlan.join("\n"),
    mode: options.mode ?? DEFAULT_AUTONOMY_FORM.mode,
  };
}
