import { describe, expect, it } from "vitest";
import { agentRoleSchema, missionWorkerCapabilitySchema } from "@ai-orchestrator/protocol";
import { defaultAgentProfiles } from "./index";
import { createAgentMissionCapability, missionCapabilitiesForProfiles } from "./productKernelContracts";

/**
 * 새 product-kernel 계약을 dead code로 두지 않고 "기존 프로필 위에 얹힌 검증된
 * 레이어"로 고정하는 테스트. 실제 defaultAgentProfiles(18개)를 입력으로 쓴다.
 */
describe("product kernel capability coverage over real default profiles", () => {
  const capabilities = missionCapabilitiesForProfiles(defaultAgentProfiles);

  it("maps every enabled default profile to a capability that validates against the protocol schema", () => {
    expect(capabilities.length).toBe(defaultAgentProfiles.filter((p) => p.enabled).length);
    for (const capability of capabilities) {
      const parsed = missionWorkerCapabilitySchema.safeParse(capability);
      expect(parsed.success, `capability for ${capability.agentId} should be schema-valid`).toBe(true);
    }
  });

  it("never falls through to conversation_only for a known role (no missing role mapping)", () => {
    // 모든 기본 역할은 명시적 capability mode를 받아야 한다 — 매핑 누락이 생기면
    // conversation_only로 조용히 떨어지는데, 그걸 회귀로 잡는다.
    const everyRoleIsKnown = defaultAgentProfiles.every((p) => agentRoleSchema.safeParse(p.role).success);
    expect(everyRoleIsKnown).toBe(true);
    for (const capability of capabilities) {
      expect(capability.mode, `${capability.role} should not silently fall back`).not.toBe("conversation_only");
    }
  });

  it("upholds the core invariant: permission level grants request-rights, sandbox grants execution", () => {
    // 쿠루미(companion)는 permissionLevel "write_files"를 갖지만, 그건 "쓰기를
    // 요청할 수 있다"는 뜻이지 "직접 실행한다"가 아니다 — capability는 파일 변경을
    // 막아야 한다. 이 불변식이 깨지면 캐릭터 권한이 곧 실행 권한으로 새는 것.
    const companion = defaultAgentProfiles.find((p) => p.role === "companion");
    expect(companion?.permissionLevel).toBe("write_files");
    const companionCapability = createAgentMissionCapability(companion!);
    expect(companionCapability.canMutateFiles).toBe(false);
    expect(companionCapability.personaContinuity.voice.preserveCharacterVoice).toBe(true);
  });

  it("only sandbox_build profiles may mutate files, and mutation always implies sandbox + approval", () => {
    for (const capability of capabilities) {
      if (capability.canMutateFiles) {
        expect(capability.mode).toBe("sandbox_build");
        expect(capability.requiresSandbox).toBe(true);
        expect(capability.requiresHumanApprovalFor).toEqual(expect.arrayContaining(["write", "edit"]));
      }
    }
  });
});
