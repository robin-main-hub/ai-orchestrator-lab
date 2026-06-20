import { describe, expect, it } from "vitest";
import { ingressReasonLabel } from "./ingressReasonLabels";

// Characterization tests for the ingress-reason → Korean label mapper (no
// behavior change). ingressReasonLabel resolves a direct dictionary first, then
// falls through three parameterized regex branches (confidence-queued, payload-
// normalized, merged-window), and finally passes an unknown reason through
// verbatim. These pin a representative direct hit, each regex branch's capture
// substitution (confidence word map, channel upper-casing, count/window
// interpolation), and the verbatim passthrough. All pure.
describe("ingressReasonLabel", () => {
  it("resolves a direct dictionary entry to its Korean label", () => {
    expect(ingressReasonLabel("external source marked untrusted")).toBe(
      "외부 소스를 신뢰하지 않는 입력으로 표시했습니다.",
    );
    expect(ingressReasonLabel("high confidence external input accepted")).toBe(
      "신뢰도 높은 외부 입력을 허용했습니다.",
    );
  });

  it("maps each confidence tier in the queued-for-approval branch", () => {
    expect(ingressReasonLabel("high confidence external input queued for approval")).toBe(
      "높은 신뢰도의 외부 입력을 승인 대기열에 넣었습니다.",
    );
    expect(ingressReasonLabel("medium confidence external input queued for approval")).toBe(
      "중간 신뢰도의 외부 입력을 승인 대기열에 넣었습니다.",
    );
    expect(ingressReasonLabel("low confidence external input queued for approval")).toBe(
      "낮은 신뢰도의 외부 입력을 승인 대기열에 넣었습니다.",
    );
  });

  it("upper-cases the channel in the payload-normalized branch", () => {
    expect(ingressReasonLabel("slack payload normalized into IngressEvent")).toBe(
      "SLACK 페이로드를 인입 이벤트로 정규화했습니다.",
    );
  });

  it("interpolates count and window in the merged-window branch", () => {
    expect(ingressReasonLabel("3 messages merged in 250ms window")).toBe(
      "3개 메시지를 250ms 병합 창에서 합쳤습니다.",
    );
  });

  it("passes an unrecognized reason through verbatim", () => {
    expect(ingressReasonLabel("some totally novel reason")).toBe("some totally novel reason");
    expect(ingressReasonLabel("")).toBe("");
  });

  it("does not match a near-miss that violates the anchored pattern", () => {
    // trailing extra text breaks the `$`-anchored confidence pattern → verbatim
    const nearMiss = "high confidence external input queued for approval now";
    expect(ingressReasonLabel(nearMiss)).toBe(nearMiss);
  });
});
