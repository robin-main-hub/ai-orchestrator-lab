export const operatorCockpitActionLabels = {
  openMemoryRecall: "Memory Recall 열기",
  openProviderRouting: "Provider Routing 열기",
  openRecoveryContinuity: "Recovery & Continuity 열기",
  previewApprovalEvidence: "Approval Evidence 미리보기",
} as const;

export type OperatorCockpitActionLabel = (typeof operatorCockpitActionLabels)[keyof typeof operatorCockpitActionLabels];
