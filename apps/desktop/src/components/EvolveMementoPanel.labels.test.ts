import { describe, expect, it } from "vitest";
import {
  mementoActionLabel,
  mementoIssueRecommendationLabel,
  mementoRelationKindLabel,
  mementoRelationReasonLabel,
  mementoSeverityLabel,
  mementoTrustLevelLabel,
} from "./EvolveMementoPanel";

// Characterization tests for the EvolveMementoPanel's six exported label
// mappers (no behavior change). Each is a pure string → string lookup over a
// small Korean-label dictionary with a verbatim passthrough fallback for any
// unrecognized key (`labels[key] ?? key`). No React render, no DOM, no
// network — importing the module only evaluates its top-level definitions.
// We pin every dictionary entry plus the passthrough branch (including the
// empty string, which is not a key) so a future rename of any label or a
// switch away from the passthrough fallback is caught.

describe("mementoActionLabel", () => {
  it("maps the known actions and passes anything else through verbatim", () => {
    expect(mementoActionLabel("activate")).toBe("활성화");
    expect(mementoActionLabel("forget")).toBe("삭제");
    expect(mementoActionLabel("pin")).toBe("고정");
    expect(mementoActionLabel("unknown")).toBe("unknown");
    expect(mementoActionLabel("")).toBe("");
  });
});

describe("mementoRelationKindLabel", () => {
  it("maps the known relation kinds and passes anything else through verbatim", () => {
    expect(mementoRelationKindLabel("contradicts")).toBe("모순");
    expect(mementoRelationKindLabel("related")).toBe("관련");
    expect(mementoRelationKindLabel("supports")).toBe("지지");
    expect(mementoRelationKindLabel("sibling")).toBe("sibling");
  });
});

describe("mementoRelationReasonLabel", () => {
  it("maps the two known reasons and passes anything else through verbatim", () => {
    expect(mementoRelationReasonLabel("overlapping topic with opposite action language")).toBe(
      "같은 주제에서 서로 반대되는 실행 표현이 겹칩니다.",
    );
    expect(mementoRelationReasonLabel("shared tags, terms, scope, or kind")).toBe(
      "태그, 용어, 범위 또는 기억 종류가 서로 겹칩니다.",
    );
    expect(mementoRelationReasonLabel("some other reason")).toBe("some other reason");
  });
});

describe("mementoSeverityLabel", () => {
  it("maps the known severities and passes anything else through verbatim", () => {
    expect(mementoSeverityLabel("high")).toBe("높음");
    expect(mementoSeverityLabel("medium")).toBe("중간");
    expect(mementoSeverityLabel("low")).toBe("낮음");
    expect(mementoSeverityLabel("critical")).toBe("critical");
  });
});

describe("mementoTrustLevelLabel", () => {
  it("maps the known trust levels and passes anything else through verbatim", () => {
    expect(mementoTrustLevelLabel("trusted")).toBe("신뢰됨");
    expect(mementoTrustLevelLabel("untrusted")).toBe("미신뢰");
    expect(mementoTrustLevelLabel("provisional")).toBe("임시");
    expect(mementoTrustLevelLabel("limited")).toBe("limited");
  });
});

describe("mementoIssueRecommendationLabel", () => {
  it("maps the known recommendations and passes anything else through verbatim", () => {
    expect(
      mementoIssueRecommendationLabel(
        "Demote, redact, or re-verify this memory before sending it to strong or remote models.",
      ),
    ).toBe("강한 모델이나 원격 모델에 보내기 전에 이 기억을 낮추거나 마스킹하거나 다시 검증하세요.");
    expect(
      mementoIssueRecommendationLabel("Merge these fragments or keep the newer one as the authoritative memory."),
    ).toBe("중복 조각을 병합하거나 더 최신 항목을 기준 기억으로 유지하세요.");
    expect(
      mementoIssueRecommendationLabel(
        "Pinned memories should be linked so the context packet can restore the project map.",
      ),
    ).toBe("고정된 기억끼리 연결해 컨텍스트 패킷이 프로젝트 지도를 복구할 수 있게 하세요.");
    expect(mementoIssueRecommendationLabel("Refresh this old memory or let the curator archive it.")).toBe(
      "오래된 기억을 새로 확인하거나 큐레이터가 보관하도록 두세요.",
    );
    expect(
      mementoIssueRecommendationLabel("Review which memory should win before automatic recall uses both."),
    ).toBe("자동 기억 조회가 두 항목을 함께 쓰기 전에 어떤 기억을 우선할지 검토하세요.");
    expect(mementoIssueRecommendationLabel("no matching recommendation")).toBe("no matching recommendation");
  });
});
