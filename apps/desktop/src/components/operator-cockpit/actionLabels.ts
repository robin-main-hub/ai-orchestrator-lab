export const operatorCockpitActionLabels = {
  openMemoryRecall: "기억 근거 열기",
  openProviderRouting: "모델 경로 열기",
  openRecoveryContinuity: "복구 상태 열기",
  previewApprovalEvidence: "승인 근거 미리보기",
} as const;

export type OperatorCockpitActionLabel = (typeof operatorCockpitActionLabels)[keyof typeof operatorCockpitActionLabels];
