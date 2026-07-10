import { describe, expect, it } from "vitest";
import {
  backupStatusLabel,
  ingressApprovalStateLabel,
  ingressConfidenceLabel,
  providerReadinessLabel,
  railStatusTone,
  runtimeNodeRoleLabel,
  runtimeStatusLabel,
  tmuxRedispatchOutcomeLabel,
} from "./railStatusLabels";

describe("railStatusLabels", () => {
  it("localizes runtime and role labels rendered in the rail panels", () => {
    expect(runtimeStatusLabel("online")).toBe("온라인");
    expect(runtimeStatusLabel("offline")).toBe("오프라인");
    expect(runtimeStatusLabel("degraded")).toBe("저하");
    expect(runtimeNodeRoleLabel("authority")).toBe("권한");
    expect(runtimeNodeRoleLabel("local models")).toBe("로컬 모델");
  });

  it("localizes backup/provider/tmux outcome labels without changing raw statuses", () => {
    expect(backupStatusLabel("ready")).toBe("준비됨");
    expect(backupStatusLabel("queued")).toBe("대기 중");
    expect(providerReadinessLabel("needs_approval")).toBe("승인 필요");
    expect(tmuxRedispatchOutcomeLabel("dry_run")).toBe("예행 실행");
  });

  it("localizes ingress confidence and approval labels", () => {
    expect(ingressConfidenceLabel("high")).toBe("높음");
    expect(ingressConfidenceLabel("medium")).toBe("중간");
    expect(ingressApprovalStateLabel("not_required")).toBe("승인 불필요");
    expect(ingressApprovalStateLabel("required")).toBe("승인 필요");
  });

  it("maps status enums to U21 tone buckets", () => {
    expect(railStatusTone("failed")).toBe("destructive");
    expect(railStatusTone("blocked")).toBe("destructive");
    expect(railStatusTone("pending_approval")).toBe("warning");
    expect(railStatusTone("watch")).toBe("warning");
    expect(railStatusTone("ready")).toBe("accent");
    expect(railStatusTone("synced")).toBe("accent");
    expect(railStatusTone("idle")).toBe("muted");
    expect(railStatusTone("totally_unknown_value")).toBe("muted");
  });
});
