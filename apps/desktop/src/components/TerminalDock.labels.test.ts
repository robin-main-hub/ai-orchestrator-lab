import { describe, expect, it } from "vitest";
import {
  terminalEventTypeLabel,
  terminalProviderReasonLabel,
  terminalSyncModeLabel,
} from "./TerminalDock";

// Characterization tests for TerminalDock's three exported label mappers (no
// behavior change). Each is a pure string → string lookup over a small
// Korean-label dictionary with a verbatim passthrough fallback for any
// unrecognized key (`labels[key] ?? key`). No React render, no DOM, no
// network — importing the module only evaluates its top-level definitions and
// the helpers under test are pure. We pin every dictionary entry plus the
// passthrough branch (including the empty string, which is not a key) so a
// future label rename or a switch away from the passthrough fallback is caught.

describe("terminalSyncModeLabel", () => {
  it("maps the known sync modes and passes anything else through verbatim", () => {
    expect(terminalSyncModeLabel("dgx02_authoritative_with_client_cache")).toBe("DGX 권위 노드 + 데스크톱 캐시");
    expect(terminalSyncModeLabel("mirror")).toBe("미러 동기화");
    expect(terminalSyncModeLabel("server_authoritative_with_local_outbox")).toBe("서버 권위 + 로컬 발신함");
    expect(terminalSyncModeLabel("offline")).toBe("offline");
    expect(terminalSyncModeLabel("")).toBe("");
  });
});

describe("terminalProviderReasonLabel", () => {
  it("maps the known provider reasons and passes anything else through verbatim", () => {
    expect(
      terminalProviderReasonLabel("DGX-02 trusted vLLM provider is reachable through the remote runtime gate"),
    ).toBe("DGX-02 신뢰 vLLM 공급자를 원격 런타임 게이트로 사용할 수 있습니다.");
    expect(terminalProviderReasonLabel("credential is missing from secret vault")).toBe(
      "비밀값 금고에 필요한 인증 정보가 없습니다.",
    );
    expect(terminalProviderReasonLabel("model discovery has no selectable models")).toBe(
      "모델 검색 결과에서 선택할 수 있는 모델이 없습니다.",
    );
    expect(terminalProviderReasonLabel("provider disabled")).toBe("공급자가 비활성화되어 있습니다.");
    expect(terminalProviderReasonLabel("provider has model metadata and a non-persisted secret reference")).toBe(
      "모델 정보와 비저장 비밀값 참조가 준비되었습니다.",
    );
    expect(terminalProviderReasonLabel("provider not selected")).toBe("공급자를 선택해야 합니다.");
    expect(
      terminalProviderReasonLabel(
        "untrusted provider can run only after explicit approval and reduced memory context",
      ),
    ).toBe("미신뢰 공급자는 명시 승인과 축소된 기억 맥락으로만 실행할 수 있습니다.");
    expect(terminalProviderReasonLabel("some other reason")).toBe("some other reason");
  });
});

describe("terminalEventTypeLabel", () => {
  it("maps the known event types and passes anything else through verbatim", () => {
    expect(terminalEventTypeLabel("coding_packet.created")).toBe("코딩 패킷 생성");
    expect(terminalEventTypeLabel("tmux.dispatch.approved")).toBe("Tmux 실행 승인");
    expect(terminalEventTypeLabel("tmux.dispatch.rejected")).toBe("Tmux 실행 거부");
    expect(terminalEventTypeLabel("tmux.dispatch.requested")).toBe("Tmux 실행 요청");
    expect(terminalEventTypeLabel("unknown.event")).toBe("unknown.event");
  });
});
